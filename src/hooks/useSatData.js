// ─── SAT Data Hooks ─────────────────────────────────────────────────────
// React hooks that replace direct mockData.js imports.
// Fetch real data from the backend API, with graceful fallback to
// mock data when the backend is unavailable.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { satApi } from '../api/satClient.js';
import { supabase } from '../api/supabaseClient.js';
import { mapFacturaRow } from '../utils/facturaMapper.js';

/**
 * Track whether the backend is available.
 * Checked once on mount and cached for the session.
 */
let _backendAvailable = null;
let _backendCheckPromise = null;

async function checkBackend() {
  if (_backendAvailable !== null) return _backendAvailable;
  if (_backendCheckPromise) return _backendCheckPromise;

  _backendCheckPromise = (async () => {
    try {
      await satApi.health();
      _backendAvailable = true;
    } catch {
      _backendAvailable = false;
    }
    return _backendAvailable;
  })();

  return _backendCheckPromise;
}

/**
 * Reset backend availability check (useful after starting the server).
 */
export function resetBackendCheck() {
  _backendAvailable = null;
  _backendCheckPromise = null;
}

// ─── useInvoices ────────────────────────────────────────────────────────
/**
 * Lee facturas reales del usuario autenticado directamente de Supabase.
 *
 * @param {object} filters - { direction, search, status, limit }
 * @returns {{ invoices: Array, loading: boolean, error: string|null, total: number, refetch: Function, isLive: boolean }}
 */
export function useInvoices(filters = {}) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!supabase) throw new Error('Supabase no está configurado.');
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('No hay sesión activa.');

      let query = supabase
        .from('facturas')
        .select('*')
        .eq('user_id', userId)
        .order('fecha_emision', { ascending: false })
        .limit(filtersRef.current.limit || 500);

      const { direction, search } = filtersRef.current;
      if (direction) query = query.eq('direction', direction);
      if (search) {
        const q = search.trim().replace(/[%,()]/g, '');
        if (q) {
          query = query.or(
            `rfc_emisor.ilike.%${q}%,rfc_receptor.ilike.%${q}%,nombre_emisor.ilike.%${q}%,nombre_receptor.ilike.%${q}%,folio.ilike.%${q}%`
          );
        }
      }

      const { data, error: qErr } = await query;
      if (qErr) throw qErr;

      let mapped = (data || []).map(mapFacturaRow);
      // status es un campo derivado (no columna de BD) — se filtra en cliente
      if (filtersRef.current.status) {
        mapped = mapped.filter(inv => inv.status === filtersRef.current.status);
      }

      setInvoices(mapped);
      setTotal(mapped.length);
      setIsLive(true);
    } catch (err) {
      console.error('useInvoices:', err.message);
      setInvoices([]);
      setTotal(0);
      setIsLive(false);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, filters.direction, filters.status, filters.search]);

  return { invoices, loading, error, total, refetch: fetchData, isLive };
}

// ─── useInvoiceDetail ───────────────────────────────────────────────────
/**
 * Lee el detalle de una factura por UUID fiscal o por id de fila.
 */
export function useInvoiceDetail(uuid) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uuid) return;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        if (!supabase) throw new Error('Supabase no está configurado.');
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) throw new Error('No hay sesión activa.');

        const looksLikeUuidFiscal = /^[0-9a-fA-F-]{30,36}$/.test(uuid);
        let query = supabase.from('facturas').select('*').eq('user_id', userId);
        query = looksLikeUuidFiscal ? query.eq('uuid_fiscal', uuid) : query.eq('id', uuid);

        const { data, error: qErr } = await query.maybeSingle();
        if (qErr) throw qErr;
        setDetail(data ? { invoice: mapFacturaRow(data), hasXml: !!data.xml_content } : null);
      } catch (err) {
        setError(err.message);
        setDetail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [uuid]);

  return { detail, loading, error };
}

// ─── useKpiData ─────────────────────────────────────────────────────────
const MES_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Agrega KPIs y datos mensuales de los últimos 6 meses a partir de
 * `facturas`. No hay columnas de rubro/ISR/IVA en el esquema actual, así
 * que rubroDistribution/taxData se devuelven vacíos (honesto, no simulado).
 */
export function useKpiData(year, month) {
  const [state, setState] = useState({
    kpis: { ingresos: 0, gastos: 0, balance: 0, ingresosDelta: 0, gastosDelta: 0, balanceDelta: 0, facturasPorCobrar: 0, facturasPorPagar: 0 },
    monthlyData: [],
    rubroDistribution: [],
    taxData: [],
  });
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        if (!supabase) throw new Error('Supabase no está configurado.');
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) throw new Error('No hay sesión activa.');

        const targetY = year ?? new Date().getFullYear();
        const targetM = month ?? (new Date().getMonth() + 1);
        const endDate = new Date(targetY, targetM, 1);      // límite superior exclusivo
        const startDate = new Date(targetY, targetM - 6, 1); // 6 meses atrás, inclusivo

        const { data, error: qErr } = await supabase
          .from('facturas')
          .select('total, direction, fecha_emision, sat_status')
          .eq('user_id', userId)
          .neq('sat_status', 'cancelada')
          .gte('fecha_emision', startDate.toISOString())
          .lt('fecha_emision', endDate.toISOString());
        if (qErr) throw qErr;

        const buckets = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(targetY, targetM - 1 - i, 1);
          buckets.push({ y: d.getFullYear(), m: d.getMonth() + 1, mes: MES_LABELS[d.getMonth()], ingresos: 0, gastos: 0 });
        }
        const idxOf = new Map(buckets.map((b, i) => [`${b.y}-${b.m}`, i]));

        for (const row of data || []) {
          if (!row.fecha_emision) continue;
          const d = new Date(row.fecha_emision);
          const i = idxOf.get(`${d.getFullYear()}-${d.getMonth() + 1}`);
          if (i === undefined) continue;
          if (row.direction === 'emitida') buckets[i].ingresos += Number(row.total) || 0;
          else if (row.direction === 'recibida') buckets[i].gastos += Number(row.total) || 0;
        }

        const current = buckets[5], previous = buckets[4];
        const pctDelta = (curr, prev) => prev === 0 ? (curr === 0 ? 0 : 100) : +(((curr - prev) / prev) * 100).toFixed(1);
        const ingresos = current.ingresos, gastos = current.gastos, balance = ingresos - gastos;
        const prevBalance = previous.ingresos - previous.gastos;

        if (!cancelled) {
          setState({
            kpis: {
              ingresos, gastos, balance,
              ingresosDelta: pctDelta(ingresos, previous.ingresos),
              gastosDelta: pctDelta(gastos, previous.gastos),
              balanceDelta: pctDelta(balance, prevBalance),
              facturasPorCobrar: 0, facturasPorPagar: 0,
            },
            monthlyData: buckets.map(({ mes, ingresos, gastos }) => ({ mes, ingresos, gastos })),
            rubroDistribution: [],
            taxData: [],
          });
          setIsLive(true);
        }
      } catch (err) {
        console.error('useKpiData:', err.message);
        if (!cancelled) {
          setState({
            kpis: { ingresos: 0, gastos: 0, balance: 0, ingresosDelta: 0, gastosDelta: 0, balanceDelta: 0, facturasPorCobrar: 0, facturasPorPagar: 0 },
            monthlyData: [], rubroDistribution: [], taxData: [],
          });
          setIsLive(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [year, month]);

  return { ...state, loading, isLive };
}

// ─── useSatSync ─────────────────────────────────────────────────────────
/**
 * Manages the full SAT Descarga Masiva lifecycle:
 * 1. Authenticate with SAT (get token)
 * 2. Query (SolicitaDescarga) → get requestId
 * 3. Verify (poll every 10s) → get packageIds
 * 4. Download packages → parse & store in Supabase
 *
 * Requires e.firma password and Supabase user_id for each call.
 */
export function useSatSync() {
  const [syncStatus, setSyncStatus] = useState('idle');
  // idle | authenticating | requesting | verifying | downloading | completed | error
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const cancelledRef = useRef(false);

  const startSync = useCallback(async (type = 'emitidos', dateStart, dateEnd, password, userId) => {
    cancelledRef.current = false;
    setSyncStatus('authenticating');
    setError(null);
    setProgress({ step: 'Autenticando con el SAT...', percent: 10 });

    try {
      // ── Step 1: Authenticate ──
      const authResult = await satApi.satAuthenticate(password, userId);
      if (!authResult.success) {
        throw new Error(authResult.error || 'Error de autenticación con el SAT.');
      }

      if (cancelledRef.current) return;
      setProgress({ step: 'Solicitando descarga al SAT...', percent: 25, rfc: authResult.rfc });
      setSyncStatus('requesting');

      // ── Step 2: Query (SolicitaDescarga) ──
      const queryResult = await satApi.satQuery({
        password,
        user_id: userId,
        type,
        dateStart,
        dateEnd,
        requestType: 'metadata', // metadata is faster, xml is full content
      });

      if (!queryResult.success) {
        throw new Error(queryResult.error || 'Error al solicitar la descarga.');
      }

      const requestId = queryResult.data?.requestId;
      if (!requestId) {
        throw new Error('El SAT no devolvió un ID de solicitud válido.');
      }

      if (cancelledRef.current) return;
      setSyncStatus('verifying');
      setProgress({ step: 'Esperando que el SAT procese...', percent: 40, requestId });

      // ── Step 3: Verify (poll every 10 seconds, up to 60 attempts = 10 min) ──
      let verifyAttempts = 0;
      const maxAttempts = 60;

      const pollVerify = () => new Promise((resolve, reject) => {
        const check = async () => {
          if (cancelledRef.current) {
            reject(new Error('Sincronización cancelada.'));
            return;
          }

          verifyAttempts++;
          try {
            const verifyResult = await satApi.satVerify({
              password,
              user_id: userId,
              requestId,
            });

            if (!verifyResult.success) {
              reject(new Error(verifyResult.error || 'Error verificando solicitud.'));
              return;
            }

            const { status, packageIds, cfdiCount } = verifyResult.data;

            setProgress({
              step: `SAT procesando... (intento ${verifyAttempts}/${maxAttempts})`,
              percent: 40 + Math.min(30, (verifyAttempts / maxAttempts) * 30),
              status,
              cfdiCount,
            });

            if (status === 'completed' && packageIds?.length > 0) {
              resolve({ packageIds, cfdiCount });
              return;
            }

            if (['error', 'rejected', 'expired'].includes(status)) {
              reject(new Error(`El SAT rechazó la solicitud: ${verifyResult.data.message || status}`));
              return;
            }

            if (verifyAttempts >= maxAttempts) {
              reject(new Error('Tiempo de espera agotado. El SAT no completó la solicitud en 10 minutos.'));
              return;
            }

            // Poll again in 10 seconds
            pollRef.current = setTimeout(check, 10000);
          } catch (err) {
            reject(err);
          }
        };

        check();
      });

      const { packageIds, cfdiCount } = await pollVerify();

      if (cancelledRef.current) return;
      setSyncStatus('downloading');
      setProgress({
        step: `Descargando ${packageIds.length} paquete(s) con ${cfdiCount} CFDIs...`,
        percent: 75,
        cfdiCount,
      });

      // ── Step 4: Download packages ──
      const downloadResult = await satApi.satDownloadPackages({
        password,
        user_id: userId,
        packageIds,
        type,
      });

      if (!downloadResult.success) {
        throw new Error(downloadResult.error || 'Error al descargar los paquetes.');
      }

      setSyncStatus('completed');
      setProgress({
        step: '¡Sincronización completada!',
        percent: 100,
        status: 'completed',
        cfdiCount: downloadResult.data?.totalProcessed || cfdiCount,
        totalProcessed: downloadResult.data?.totalProcessed || 0,
        totalErrors: downloadResult.data?.totalErrors || 0,
      });
    } catch (err) {
      if (!cancelledRef.current) {
        setSyncStatus('error');
        setError(err.message);
        setProgress(null);
      }
    }
  }, []);

  const cancelSync = useCallback(() => {
    cancelledRef.current = true;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    setSyncStatus('idle');
    setProgress(null);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  return { syncStatus, progress, error, startSync, cancelSync };
}

// ─── useAuthStatus ──────────────────────────────────────────────────────
/**
 * Check SAT authentication/certificate status.
 */
export function useAuthStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const backendUp = await checkBackend();
      if (backendUp) {
        const response = await satApi.getAuthStatus();
        if (response.success) {
          setStatus(response.data);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Backend not available
    }

    // Fallback
    setStatus({
      initialized: false,
      rfc: 'GTE210401AB3',
      credentialsConfigured: false,
      certificateExpiration: null,
    });
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { status, loading, refresh };
}

// ─── useRetenciones ─────────────────────────────────────────────────────
/**
 * El esquema actual de `facturas` no tiene columnas de retención
 * (isr_retenido/iva_retenido) — no hay nada que consultar. Se devuelve un
 * estado vacío honesto en vez de datos simulados.
 */
export function useRetenciones() {
  return { retenciones: [], loading: false, isLive: true };
}

// ─── useInconsistencias ─────────────────────────────────────────────────
/**
 * Lee las inconsistencias (motor de auditoría) de las facturas del usuario
 * actual. Consulta en dos pasos: primero los ids de sus facturas, luego las
 * inconsistencias que las referencian — más robusto que depender de que
 * PostgREST descubra la relación FK para un embedded select.
 */
export function useInconsistencias() {
  const [inconsistencias, setInconsistencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase no está configurado.');
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { setInconsistencias([]); return; }

      const { data: facturas, error: errF } = await supabase
        .from('facturas').select('id').eq('user_id', userId);
      if (errF) throw errF;
      const ids = (facturas || []).map(f => f.id);
      if (ids.length === 0) { setInconsistencias([]); return; }

      const { data: incs, error: errI } = await supabase
        .from('inconsistencias_facturas').select('*').in('factura_id', ids);
      if (errI) throw errI;
      setInconsistencias(incs || []);
    } catch (err) {
      setError(err.message);
      setInconsistencias([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { inconsistencias, loading, error, refetch: fetchData };
}
