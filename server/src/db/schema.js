// ─── Database Schema ────────────────────────────────────────────────────
// Creates all tables and indexes needed for caching SAT CFDI data.
// Safe to call multiple times — uses IF NOT EXISTS.
// ─────────────────────────────────────────────────────────────────────────

import { getDatabase } from './connection.js';

/**
 * Initialize the database schema.
 * Creates tables for CFDIs, download requests, and tax computations.
 */
export function initializeSchema() {
  const db = getDatabase();

  db.exec(`
    -- ─── CFDI Cache ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cfdi (
      uuid TEXT PRIMARY KEY,
      rfc_emisor TEXT NOT NULL,
      rfc_receptor TEXT NOT NULL,
      nombre_emisor TEXT,
      nombre_receptor TEXT,
      regimen_fiscal_emisor TEXT,
      uso_cfdi TEXT,
      fecha TEXT NOT NULL,
      fecha_timbrado TEXT,
      tipo_comprobante TEXT CHECK(tipo_comprobante IN ('I','E','P','N','T')),
      subtotal REAL DEFAULT 0,
      descuento REAL DEFAULT 0,
      total REAL DEFAULT 0,
      moneda TEXT DEFAULT 'MXN',
      tipo_cambio REAL DEFAULT 1,
      serie TEXT,
      folio TEXT,
      forma_pago TEXT,
      metodo_pago TEXT,
      lugar_expedicion TEXT,
      direction TEXT CHECK(direction IN ('emitida', 'recibida')),
      sat_status TEXT DEFAULT 'vigente',
      xml_content TEXT,
      parsed_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ─── CFDI Conceptos ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cfdi_conceptos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cfdi_uuid TEXT NOT NULL,
      clave_prod_serv TEXT,
      clave_unidad TEXT,
      descripcion TEXT NOT NULL,
      cantidad REAL DEFAULT 1,
      valor_unitario REAL DEFAULT 0,
      importe REAL DEFAULT 0,
      descuento REAL DEFAULT 0,
      FOREIGN KEY (cfdi_uuid) REFERENCES cfdi(uuid) ON DELETE CASCADE
    );

    -- ─── CFDI Impuestos (traslados y retenciones por concepto) ────────
    CREATE TABLE IF NOT EXISTS cfdi_impuestos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cfdi_uuid TEXT NOT NULL,
      tipo TEXT CHECK(tipo IN ('traslado', 'retencion')),
      impuesto TEXT,
      tipo_factor TEXT,
      tasa_o_cuota REAL,
      base REAL DEFAULT 0,
      importe REAL DEFAULT 0,
      FOREIGN KEY (cfdi_uuid) REFERENCES cfdi(uuid) ON DELETE CASCADE
    );

    -- ─── Timbre Fiscal Digital ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cfdi_timbre (
      uuid TEXT PRIMARY KEY,
      fecha_timbrado TEXT,
      rfc_prov_certif TEXT,
      sello_cfd TEXT,
      no_certificado_sat TEXT,
      sello_sat TEXT,
      FOREIGN KEY (uuid) REFERENCES cfdi(uuid) ON DELETE CASCADE
    );

    -- ─── Download Requests (tracking SAT async operations) ────────────
    CREATE TABLE IF NOT EXISTS download_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      type TEXT CHECK(type IN ('emitidos', 'recibidos', 'folio')),
      request_type TEXT CHECK(request_type IN ('xml', 'metadata')) DEFAULT 'xml',
      date_start TEXT,
      date_end TEXT,
      status TEXT DEFAULT 'pending',
      status_code INTEGER,
      message TEXT,
      package_ids TEXT,
      cfdi_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    -- ─── Indexes ──────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_cfdi_fecha ON cfdi(fecha);
    CREATE INDEX IF NOT EXISTS idx_cfdi_rfc_emisor ON cfdi(rfc_emisor);
    CREATE INDEX IF NOT EXISTS idx_cfdi_rfc_receptor ON cfdi(rfc_receptor);
    CREATE INDEX IF NOT EXISTS idx_cfdi_direction ON cfdi(direction);
    CREATE INDEX IF NOT EXISTS idx_cfdi_tipo ON cfdi(tipo_comprobante);
    CREATE INDEX IF NOT EXISTS idx_cfdi_sat_status ON cfdi(sat_status);
    CREATE INDEX IF NOT EXISTS idx_conceptos_uuid ON cfdi_conceptos(cfdi_uuid);
    CREATE INDEX IF NOT EXISTS idx_impuestos_uuid ON cfdi_impuestos(cfdi_uuid);
    CREATE INDEX IF NOT EXISTS idx_download_status ON download_requests(status);
  `);

  console.log('✅ Database schema initialized');
}
