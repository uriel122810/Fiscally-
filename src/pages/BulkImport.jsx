import { useState, useRef, useEffect } from 'react';
import { FileArchive, Upload, Loader2, CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react';
import { formatCurrency } from '../data/mockData';
import { supabase } from '../api/supabaseClient';

const TIPO_BADGES = {
  I: { cls: 'badge-cobrada', label: 'Ingreso' },
  E: { cls: 'badge-cancelada', label: 'Egreso' },
  N: { cls: 'badge-cobrar', label: 'Nómina' },
  P: { cls: 'badge-pagar', label: 'Pago' },
  T: { cls: 'badge-pendiente', label: 'Traslado' },
};

const SEVERIDAD_BADGES = {
  critica: { cls: 'badge-cancelada', label: 'Crítica' },
  alta: { cls: 'badge-pagar', label: 'Alta' },
};

function TipoBadge({ tipo }) {
  const info = TIPO_BADGES[tipo] || { cls: 'badge-pendiente', label: tipo };
  return <span className={`badge ${info.cls}`}><span className="badge-dot" /> {info.label}</span>;
}

const MAX_ERRORS_VISIBLE = 50;
const PREVIEW_ROWS = 8;
// Tolerancia para diferencias de redondeo de punto flotante al comparar
// total facturado vs. neto pagado calculado (no es un umbral de negocio).
const TOLERANCIA_DISCREPANCIA = 0.01;

export default function BulkImport() {
  const [status, setStatus] = useState('idle'); // idle | starting | processing | saving | done | error
  const [fileName, setFileName] = useState('');
  const [totalXml, setTotalXml] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [invoices, setInvoices] = useState([]);
  const [saved, setSaved] = useState(0);
  const [anomalias, setAnomalias] = useState([]);
  const [dbErrors, setDbErrors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const workerRef = useRef(null);
  const inputRef = useRef(null);
  const userIdRef = useRef(null);
  const companyRfcRef = useRef(null);
  // Contador de generación: al cancelar se incrementa y los lotes en vuelo de
  // la corrida vieja se resuelven sin tocar el estado.
  const runIdRef = useRef(0);
  // Cola serializada: el worker produce lotes más rápido de lo que la red
  // inserta; el encadenamiento garantiza un upsert a la vez y en orden.
  const saveChainRef = useRef(Promise.resolve());
  const batchCountRef = useRef(0);

  const running = status === 'starting' || status === 'processing' || status === 'saving';
  const pct = totalXml ? Math.min(100, Math.round((processed / totalXml) * 100)) : 0;

  useEffect(() => () => workerRef.current?.terminate(), []);

  const stopWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  const procesarLoteEnSupabase = async (lote, runId) => {
    const userId = userIdRef.current;

    // 1. Mapear el lote del worker a las columnas de la tabla `facturas`
    const companyRfc = companyRfcRef.current;
    const rows = lote.map(inv => ({
      user_id: userId,
      uuid_fiscal: inv.uuid,
      rfc_emisor: inv.rfcEmisor,
      rfc_receptor: inv.rfcReceptor,
      nombre_emisor: inv.nombreEmisor,
      nombre_receptor: inv.nombreReceptor,
      total: inv.total,
      subtotal: inv.subtotal,
      tipo_cfdi: inv.tipoComprobante,
      fecha_emision: inv.fecha,
      moneda: inv.moneda,
      serie: inv.serie,
      folio: inv.folio,
      forma_pago: inv.formaPago,
      metodo_pago: inv.metodoPago,
      // Sin el RFC de la empresa configurado no podemos saber si la factura
      // es emitida o recibida; se deja null en vez de adivinar.
      direction: companyRfc
        ? (inv.rfcEmisor?.toUpperCase().trim() === companyRfc ? 'emitida' : 'recibida')
        : null,
      sat_status: 'vigente',
      estado_revision: 'pendiente',
      source: 'bulk_import',
    }));

    // 2. Upsert masivo del lote + .select() para obtener los ids generados
    const { data: insertadas, error } = await supabase
      .from('facturas')
      .upsert(rows, { onConflict: 'uuid_fiscal' })
      .select();
    if (error) throw new Error(`Upsert facturas: ${error.message}`);

    // 3-4. Motor de Auditoría: para nómina, el total facturado debe coincidir
    // con el neto pagado que calculó el worker. No importa la magnitud de la
    // diferencia — cualquier descuadre es la anomalía.
    const porUuid = new Map(lote.map(inv => [inv.uuid, inv]));
    const inconsistencias = [];
    for (const factura of insertadas) {
      const original = porUuid.get(factura.uuid_fiscal);
      if (!original || factura.tipo_cfdi !== 'N' || !original.nomina) continue;
      const netoPagado = original.nomina.netoPagado;
      if (Math.abs(factura.total - netoPagado) > TOLERANCIA_DISCREPANCIA) {
        inconsistencias.push({
          factura_id: factura.id,
          tipo_anomalia: 'discrepancia_nomina',
          severidad: 'alta',
          descripcion_analisis: `Discrepancia detectada: el total facturado (${formatCurrency(factura.total)}) no coincide con el neto pagado calculado (${formatCurrency(netoPagado)}).`,
        });
      }
    }

    // 5. Guardar las inconsistencias del lote; upsert cruzando factura_id +
    // tipo_anomalia evita duplicar la misma alerta si se re-sube el mismo ZIP.
    if (inconsistencias.length) {
      const { error: errInc } = await supabase
        .from('inconsistencias_facturas')
        .upsert(inconsistencias, { onConflict: 'factura_id,tipo_anomalia' });
      if (errInc) throw new Error(`Guardar inconsistencias: ${errInc.message}`);
    }

    if (runIdRef.current === runId) {
      setSaved(prev => prev + insertadas.length);
      if (inconsistencias.length) setAnomalias(prev => [...prev, ...inconsistencias]);
    }
  };

  const startProcessing = async (file) => {
    if (!supabase) {
      setStatus('error');
      setErrorMsg('Supabase no está configurado (faltan variables de entorno).');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      setStatus('error');
      setErrorMsg('No hay sesión activa; vuelve a iniciar sesión para guardar las facturas.');
      return;
    }
    const { data: config } = await supabase
      .from('configuracion_sat')
      .select('rfc')
      .eq('user_id', userId)
      .maybeSingle();
    companyRfcRef.current = (config?.rfc || '').toUpperCase().trim() || null;

    stopWorker();
    userIdRef.current = userId;
    const runId = ++runIdRef.current;
    saveChainRef.current = Promise.resolve();
    batchCountRef.current = 0;
    setStatus('starting');
    setFileName(file.name);
    setTotalXml(0);
    setProcessed(0);
    setInvoices([]);
    setSaved(0);
    setAnomalias([]);
    setDbErrors([]);
    setSummary(null);
    setErrorMsg('');

    const worker = new Worker(new URL('../workers/cfdiZip.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (e) => {
      const data = e.data;
      switch (data.type) {
        case 'meta':
          setTotalXml(data.totalXml);
          setStatus('processing');
          break;
        case 'progress':
          setProcessed(data.processed);
          break;
        case 'batch': {
          setProcessed(data.processed);
          setInvoices(prev => [...prev, ...data.invoices]);
          const lote = data.invoices;
          const numLote = ++batchCountRef.current;
          saveChainRef.current = saveChainRef.current
            .then(() => procesarLoteEnSupabase(lote, runId))
            .catch(err => {
              // Un lote fallido no aborta la corrida; se registra y se sigue
              if (runIdRef.current === runId) {
                setDbErrors(prev => [...prev, { lote: numLote, message: err.message }]);
              }
            });
          break;
        }
        case 'done':
          setSummary(data.summary);
          setProcessed(data.summary.totalXml);
          stopWorker();
          // El parseo terminó pero puede haber lotes pendientes en la cola
          setStatus('saving');
          saveChainRef.current.then(() => {
            if (runIdRef.current === runId) setStatus('done');
          });
          break;
        case 'error':
          setErrorMsg(data.message);
          setStatus('error');
          stopWorker();
          break;
      }
    };
    worker.onerror = (err) => {
      setErrorMsg(err.message || 'Error inesperado en el worker');
      setStatus('error');
      stopWorker();
    };
    // File es structured-cloneable y disk-backed: se pasa la referencia,
    // no una copia de los 100 MB+.
    worker.postMessage({ type: 'start', file, batchSize: 25 });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a seleccionar el mismo ZIP
    if (!file) return;
    startProcessing(file);
  };

  const handleCancel = () => {
    runIdRef.current++;
    stopWorker();
    saveChainRef.current = Promise.resolve();
    batchCountRef.current = 0;
    companyRfcRef.current = null;
    setStatus('idle');
    setFileName('');
    setTotalXml(0);
    setProcessed(0);
    setInvoices([]);
    setSaved(0);
    setAnomalias([]);
    setDbErrors([]);
    setSummary(null);
    setErrorMsg('');
  };

  const nominas = invoices.filter(inv => inv.nomina);
  const totalNominas = nominas.reduce((s, inv) => s + inv.nomina.netoPagado, 0);
  const totalImportado = invoices.reduce((s, inv) => s + inv.total, 0);
  const preview = invoices.slice(-PREVIEW_ROWS).reverse();

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Carga Masiva de CFDI</h1>
          <p>Procesa ZIPs del SAT (100 MB+) directamente en tu navegador, sin pasar por el servidor</p>
        </div>
        <div className="page-header-actions">
          {running && (
            <button className="btn btn-secondary" onClick={handleCancel}>
              <X size={15} /> Cancelar
            </button>
          )}
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={running}>
            {running ? <Loader2 size={15} className="spin-icon" /> : <Upload size={15} />}
            Seleccionar ZIP
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {status === 'idle' && (
        <div className="card card-pad">
          <div className="empty-state" style={{ padding: 'var(--sp-8) 0' }}>
            <div style={{ width: 56, height: 56, background: '#6366F118', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--sp-4)' }}>
              <FileArchive size={26} style={{ color: 'var(--accent-500)' }} />
            </div>
            <h3>Sube un ZIP con tus facturas XML</h3>
            <p style={{ maxWidth: 460, margin: '0 auto' }}>
              La descompresión y lectura corren en un Web Worker: la interfaz no se
              congela aunque el archivo contenga miles de CFDI. Cada lote de 25 se
              guarda en Supabase y pasa por el motor de auditoría.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 'var(--sp-5)' }} onClick={() => inputRef.current?.click()}>
              <Upload size={15} /> Seleccionar archivo
            </button>
          </div>
        </div>
      )}

      {(running || status === 'done') && (
        <div className="card card-pad" style={{ marginBottom: 'var(--sp-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div style={{ width: 40, height: 40, background: '#6366F118', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {running
                ? <Loader2 size={18} className="spin-icon" style={{ color: 'var(--accent-500)' }} />
                : <CheckCircle size={18} style={{ color: 'var(--success-text)' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fileName}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                {status === 'starting' && 'Leyendo directorio del ZIP...'}
                {status === 'processing' && `Extrayendo y guardando en lotes de 25 — ${saved.toLocaleString('es-MX')} guardadas`}
                {status === 'saving' && `Guardando lotes restantes en Supabase... ${saved.toLocaleString('es-MX')} guardadas`}
                {status === 'done' && `Completado en ${(summary.durationMs / 1000).toFixed(1)} s — ${saved.toLocaleString('es-MX')} facturas guardadas en Supabase`}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
              {totalXml > 0 ? `${processed.toLocaleString('es-MX')} / ${totalXml.toLocaleString('es-MX')} XML — ${pct}%` : '—'}
            </div>
          </div>
          <div style={{ height: 8, background: 'var(--border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: status === 'done' ? 'var(--success-text)' : 'var(--accent-500)', borderRadius: 'var(--radius-full)', transition: 'width .2s ease' }} />
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="card card-pad" style={{ marginBottom: 'var(--sp-6)', borderColor: 'var(--danger-text)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <AlertCircle size={18} style={{ color: 'var(--danger-text)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--danger-text)' }}>Error al procesar el ZIP</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>{errorMsg}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleCancel}>Reintentar</button>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div style={{ display: 'flex', gap: 'var(--sp-5)', marginBottom: 'var(--sp-6)', flexWrap: 'wrap' }}>
          {[
            { label: 'XML procesados', value: summary.totalXml.toLocaleString('es-MX'), icon: '📦', color: '#6366F1' },
            { label: 'Guardadas en Supabase', value: saved.toLocaleString('es-MX'), icon: '✅', color: '#10B981' },
            { label: 'Monto total', value: formatCurrency(totalImportado), icon: '💰', color: '#0EA5E9', isCurrency: true },
            { label: 'Anomalías detectadas', value: anomalias.length.toLocaleString('es-MX'), icon: '🚨', color: '#DC2626' },
            { label: 'Omitidos / duplicados', value: `${summary.skippedNonCfdi.toLocaleString('es-MX')} / ${summary.duplicates.toLocaleString('es-MX')}`, icon: '⏭️', color: '#F59E0B' },
            { label: 'Errores', value: (summary.errors.length + dbErrors.length).toLocaleString('es-MX'), icon: '⚠️', color: '#EF4444' },
          ].map((stat, i) => (
            <div key={i} className="card card-pad" style={{ flex: 1, minWidth: 170 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                <div style={{ width: 40, height: 40, background: `${stat.color}18`, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                  {stat.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                  <div className={stat.isCurrency ? 'mono' : ''} style={{ fontSize: stat.isCurrency ? 'var(--text-lg)' : 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 2 }}>
                    {stat.value}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'done' && anomalias.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 'var(--sp-6)' }}>
          <div className="section-label" style={{ marginBottom: 'var(--sp-3)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <AlertTriangle size={14} style={{ color: 'var(--warning-text)' }} />
            Motor de Auditoría — {anomalias.length.toLocaleString('es-MX')} inconsistencias
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxHeight: 320, overflowY: 'auto' }}>
            {anomalias.slice(0, MAX_ERRORS_VISIBLE).map((anom, i) => {
              const sev = SEVERIDAD_BADGES[anom.severidad] || { cls: 'badge-pendiente', label: anom.severidad };
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)' }}>
                  <span className={`badge ${sev.cls}`} style={{ flexShrink: 0 }}><span className="badge-dot" /> {sev.label}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{anom.descripcion_analisis}</div>
                    <div className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {anom.tipo_anomalia} · factura_id: {anom.factura_id}
                    </div>
                  </div>
                </div>
              );
            })}
            {anomalias.length > MAX_ERRORS_VISIBLE && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                ... y {(anomalias.length - MAX_ERRORS_VISIBLE).toLocaleString('es-MX')} más
              </div>
            )}
          </div>
        </div>
      )}

      {dbErrors.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 'var(--sp-6)' }}>
          <div className="section-label" style={{ marginBottom: 'var(--sp-3)' }}>
            Errores al guardar en Supabase ({dbErrors.length.toLocaleString('es-MX')} lotes)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', maxHeight: 260, overflowY: 'auto' }}>
            {dbErrors.slice(0, MAX_ERRORS_VISIBLE).map((err, i) => (
              <div key={i} className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--danger-text)' }}>
                Lote {err.lote} — {err.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 'done' && nominas.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 'var(--sp-6)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <TipoBadge tipo="N" />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {nominas.length.toLocaleString('es-MX')} recibos de nómina — neto pagado{' '}
            <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(totalNominas)}</span>
          </span>
        </div>
      )}

      {status === 'done' && summary.errors.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 'var(--sp-6)' }}>
          <div className="section-label" style={{ marginBottom: 'var(--sp-3)' }}>
            Archivos con error ({summary.errors.length.toLocaleString('es-MX')})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', maxHeight: 260, overflowY: 'auto' }}>
            {summary.errors.slice(0, MAX_ERRORS_VISIBLE).map((err, i) => (
              <div key={i} className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--danger-text)' }}>
                {err.file} — {err.message}
              </div>
            ))}
            {summary.errors.length > MAX_ERRORS_VISIBLE && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                ... y {(summary.errors.length - MAX_ERRORS_VISIBLE).toLocaleString('es-MX')} más
              </div>
            )}
          </div>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="card">
          <div style={{ padding: 'var(--sp-5) var(--sp-6) 0' }}>
            <div className="section-label">
              {running ? 'Últimas facturas extraídas' : `Vista previa (últimas ${Math.min(PREVIEW_ROWS, invoices.length)} de ${invoices.length.toLocaleString('es-MX')})`}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>UUID</th>
                  <th>RFC Emisor</th>
                  <th>RFC Receptor</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(inv => (
                  <tr key={inv.uuid}>
                    <td className="mono" style={{ fontSize: 'var(--text-xs)' }}>{inv.uuid}</td>
                    <td className="mono">{inv.rfcEmisor}</td>
                    <td className="mono">{inv.rfcReceptor}</td>
                    <td><TipoBadge tipo={inv.tipoComprobante} /></td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {inv.nomina ? formatCurrency(inv.nomina.netoPagado) : formatCurrency(inv.total, inv.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
