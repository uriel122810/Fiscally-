import { useState } from 'react';
import {
  X, Shield, ShieldOff, FileDown, FileText, ExternalLink,
  Tag, MessageSquare, Mail, Copy, XCircle, Send, AlertTriangle, Loader2
} from 'lucide-react';
import { formatCurrency, formatDate } from '../data/mockData';
import { satApi } from '../api/satClient';

function StatusBadge({ status }) {
  const map = {
    por_cobrar: { cls: 'badge-cobrar', label: 'Por cobrar' },
    por_pagar:  { cls: 'badge-pagar',  label: 'Por pagar'  },
    cobrada:    { cls: 'badge-cobrada',label: 'Cobrada'    },
    pagada:     { cls: 'badge-pagada', label: 'Pagada'     },
    cancelada:  { cls: 'badge-cancelada', label: 'Cancelada' },
  };
  const info = map[status] || { cls: 'badge-pendiente', label: status };
  return (
    <span className={`badge ${info.cls}`}>
      <span className="badge-dot" /> {info.label}
    </span>
  );
}

function ConfirmModal({ title, message, danger, onConfirm, onCancel }) {
  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
          {danger && <AlertTriangle size={20} style={{ color: 'var(--danger-text)' }} />}
          <h3>{title}</h3>
        </div>
        <p>{message}</p>
        <div className="confirm-modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailModal({ invoice, onClose }) {
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    setSent(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <Mail size={18} style={{ color: 'var(--accent-500)' }} />
          Enviar factura por correo
        </h3>
        <p>Se enviará la factura {invoice.serie}{invoice.folio} junto con los archivos XML y PDF adjuntos.</p>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 'var(--sp-1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Destinatario
          </label>
          <input
            className="search-input"
            defaultValue={`fiscal@${invoice.rfc.toLowerCase().slice(0, 8)}.mx`}
            style={{ paddingLeft: 'var(--sp-3)', width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 'var(--sp-1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mensaje (opcional)
          </label>
          <textarea
            className="chat-input"
            rows={3}
            placeholder="Agregar un mensaje al correo..."
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-2)', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          <FileText size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Adjuntos: <strong>{invoice.serie}{invoice.folio}.xml</strong>, <strong>{invoice.serie}{invoice.folio}.pdf</strong>
          </div>
        </div>

        {sent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', justifyContent: 'center', color: 'var(--success-text)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
            ✓ Correo enviado exitosamente
          </div>
        ) : (
          <div className="confirm-modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSend}>
              <Send size={14} /> Enviar correo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvoiceDrawer({ invoice, onClose }) {
  const isVigente = invoice.sat_status === 'vigente';
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [noteText, setNoteText] = useState(invoice.notas || '');
  const [isEditingNote, setIsEditingNote] = useState(false);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        {/* Header */}
        <div className="drawer-header">
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {invoice.direction === 'recibida' ? 'Factura Recibida' : 'Factura Emitida'}
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {invoice.serie}{invoice.folio}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>
              {invoice.razon_social}
            </div>
          </div>
          <button className="icon-btn btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {/* SAT Status Bar */}
          <div className={`sat-status-bar ${isVigente ? 'vigente' : 'cancelada'}`}>
            {isVigente
              ? <Shield size={16} />
              : <ShieldOff size={16} />
            }
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                {isVigente ? 'Validada ante el SAT' : '⚠️ Cancelada en el SAT'}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', opacity: 0.8 }}>
                UUID: <span className="mono">{invoice.uuid_cfdi}</span>
              </div>
            </div>
            <StatusBadge status={invoice.status} />
          </div>

          {/* Quick Actions Grid */}
          <div className="drawer-actions-grid">
            <button className="drawer-action-btn" onClick={() => setShowEmailModal(true)}>
              <Mail size={16} style={{ color: 'var(--accent-500)' }} />
              Enviar por correo
            </button>
            <button className="drawer-action-btn" onClick={() => setShowCopyConfirm(true)}>
              <Copy size={16} style={{ color: '#10B981' }} />
              Emitir similar
            </button>
            <button
              className="drawer-action-btn"
              onClick={() => setShowCancelConfirm(true)}
              style={{ '--hover-color': 'var(--danger-text)' }}
            >
              <XCircle size={16} style={{ color: 'var(--danger-text)' }} />
              Cancelar factura
            </button>
          </div>

          {/* Emisor / Receptor */}
          <div style={{ marginTop: 'var(--sp-5)' }}>
            <div className="section-label">Partes</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
              {[
                { label: invoice.direction === 'recibida' ? 'Emisor (Proveedor)' : 'Emisor (Nosotros)', rfc: invoice.rfc, nombre: invoice.razon_social },
                { label: invoice.direction === 'recibida' ? 'Receptor (Nosotros)' : 'Receptor (Cliente)', rfc: 'GTE210401AB3', nombre: 'Grupo Tecnológico SAS de CV' },
              ].map((part, i) => (
                <div key={i} style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-4)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{part.label}</div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.3 }}>{part.nombre}</div>
                  <div className="mono-sm" style={{ color: 'var(--text-secondary)' }}>{part.rfc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rubro & Fecha */}
          <div className="divider" />
          <div className="section-label">Información General</div>
          <div className="detail-row">
            <span className="detail-label">Rubro</span>
            <span className="rubro-badge" style={{ background: `${invoice.rubroColor}18`, color: invoice.rubroColor }}>
              <Tag size={11} /> {invoice.rubro}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Fecha de Emisión</span>
            <span className="detail-value">{formatDate(invoice.fecha)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Moneda</span>
            <span className="detail-value mono">{invoice.moneda}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Tipo Comprobante</span>
            <span className="detail-value">{invoice.tipo}</span>
          </div>

          {/* Conceptos */}
          <div className="divider" />
          <div className="section-label">Conceptos</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 'var(--sp-5)' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Descripción</th>
                  <th style={{ textAlign: 'right', width: 60 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 'var(--text-sm)' }}>{item.descripcion}</td>
                    <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }} className="mono">{item.cantidad}</td>
                    <td style={{ textAlign: 'right' }} className="amount-cell">{formatCurrency(item.precio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Desglose fiscal */}
          <div className="section-label">Desglose Fiscal</div>
          <div className="detail-row">
            <span className="detail-label">Subtotal</span>
            <span className="detail-value mono">{formatCurrency(invoice.subtotal)}</span>
          </div>
          {invoice.iva > 0 && (
            <div className="detail-row">
              <span className="detail-label">IVA (16%)</span>
              <span className="detail-value mono">{formatCurrency(invoice.iva)}</span>
            </div>
          )}
          {invoice.items.some(i => i.iva === 0) && (
            <div className="detail-row">
              <span className="detail-label">Nómina (exento)</span>
              <span className="detail-value mono">$0.00</span>
            </div>
          )}

          <div className="total-row">
            <span className="total-label">Total</span>
            <span className="total-amount">{formatCurrency(invoice.total, invoice.moneda)}</span>
          </div>

          {/* Notes */}
          <div className="divider" />
          <div className="section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              <MessageSquare size={12} style={{ display: 'inline', marginRight: 6 }} />
              Notas Internas
            </span>
            {!isEditingNote && (
              <button className="btn btn-ghost btn-sm" onClick={() => setIsEditingNote(true)} style={{ textTransform: 'none', letterSpacing: 0 }}>
                {noteText ? 'Editar' : '+ Agregar nota'}
              </button>
            )}
          </div>
          {isEditingNote ? (
            <div>
              <textarea
                className="chat-input"
                rows={3}
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Agrega comentarios internos a esta factura..."
                style={{ width: '100%', resize: 'vertical', marginBottom: 'var(--sp-2)' }}
              />
              <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setIsEditingNote(false)}>Cancelar</button>
                <button className="btn btn-primary btn-sm" onClick={() => setIsEditingNote(false)}>Guardar</button>
              </div>
            </div>
          ) : noteText ? (
            <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {noteText}
            </div>
          ) : (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              Sin notas. Haz clic en "+ Agregar nota" para agregar comentarios.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => satApi.downloadXml(invoice.uuid_cfdi || invoice.id, `${invoice.serie}${invoice.folio}.xml`)}
          >
            <FileDown size={15} /> Descargar XML
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => satApi.downloadPdf(invoice.uuid_cfdi || invoice.id, `${invoice.serie}${invoice.folio}.pdf`)}
          >
            <FileText size={15} /> Generar PDF
          </button>
          <button className="btn btn-ghost btn-icon" title="Abrir en nueva pestaña">
            <ExternalLink size={15} />
          </button>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <EmailModal invoice={invoice} onClose={() => setShowEmailModal(false)} />
      )}

      {/* Cancel Confirmation */}
      {showCancelConfirm && (
        <ConfirmModal
          title="Cancelar factura"
          message={`¿Estás seguro de que deseas solicitar la cancelación de la factura ${invoice.serie}${invoice.folio}? Esta acción se enviará al SAT y no se puede deshacer.`}
          danger
          onConfirm={() => setShowCancelConfirm(false)}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      {/* Copy/Similar Confirmation */}
      {showCopyConfirm && (
        <ConfirmModal
          title="Emitir factura similar"
          message={`Se creará un borrador de nueva factura con los mismos datos de ${invoice.serie}${invoice.folio} (razón social, conceptos, montos). Podrás editarla antes de timbrar.`}
          onConfirm={() => setShowCopyConfirm(false)}
          onCancel={() => setShowCopyConfirm(false)}
        />
      )}
    </>
  );
}
