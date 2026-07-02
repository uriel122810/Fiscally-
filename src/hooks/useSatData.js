// ─── SAT Data Hooks ─────────────────────────────────────────────────────
// React hooks that replace direct mockData.js imports.
// Fetch real data from the backend API, with graceful fallback to
// mock data when the backend is unavailable.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { satApi } from '../api/satClient.js';
import {
  invoices as mockInvoices,
  kpiData as mockKpiData,
  monthlyData as mockMonthlyData,
  rubroDistribution as mockRubroDistribution,
  taxDeclarations as mockTaxDeclarations,
  retenciones as mockRetenciones,
  formatCurrency,
  formatDate,
} from '../data/mockData.js';

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
 * Fetch invoices from the backend API with filters.
 * Falls back to mock data if the backend is unavailable.
 *
 * @param {object} filters - { direction, year, month, rfc, search, status, limit, offset }
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
      const backendUp = await checkBackend();

      if (backendUp) {
        const response = await satApi.getCfdis(filtersRef.current);

        if (response.success && response.data?.invoices?.length > 0) {
          setInvoices(response.data.invoices);
          setTotal(response.data.total);
          setIsLive(true);
        } else {
          // Backend is up but no data — show mock data as placeholder
          setInvoices(applyMockFilters(mockInvoices, filtersRef.current));
          setTotal(mockInvoices.length);
          setIsLive(false);
        }
      } else {
        // Backend not available — use mock data
        setInvoices(applyMockFilters(mockInvoices, filtersRef.current));
        setTotal(mockInvoices.length);
        setIsLive(false);
      }
    } catch (err) {
      console.warn('useInvoices: falling back to mock data', err.message);
      setInvoices(applyMockFilters(mockInvoices, filtersRef.current));
      setTotal(mockInvoices.length);
      setIsLive(false);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [
    fetchData,
    filters.direction,
    filters.year,
    filters.month,
    filters.status,
    filters.search,
  ]);

  return { invoices, loading, error, total, refetch: fetchData, isLive };
}

/**
 * Apply filters to mock data (client-side fallback).
 */
function applyMockFilters(data, filters) {
  let list = [...data];

  if (filters.direction && filters.direction !== 'all') {
    list = list.filter(i => i.direction === filters.direction);
  }

  if (filters.status && filters.status !== 'all') {
    list = list.filter(i => i.status === filters.status);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(i =>
      i.razon_social?.toLowerCase().includes(q) ||
      i.rfc?.toLowerCase().includes(q) ||
      i.folio?.toLowerCase().includes(q)
    );
  }

  return list;
}

// ─── useInvoiceDetail ───────────────────────────────────────────────────
/**
 * Fetch a single CFDI detail by UUID.
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
        const backendUp = await checkBackend();
        if (backendUp) {
          const response = await satApi.getCfdiDetail(uuid);
          if (response.success) {
            setDetail(response.data);
            return;
          }
        }
        // Fallback: find in mock data
        const mock = mockInvoices.find(i => i.uuid_cfdi === uuid || i.id === uuid);
        setDetail(mock ? { invoice: mock, hasXml: false } : null);
      } catch (err) {
        setError(err.message);
        const mock = mockInvoices.find(i => i.uuid_cfdi === uuid || i.id === uuid);
        setDetail(mock ? { invoice: mock, hasXml: false } : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [uuid]);

  return { detail, loading, error };
}

// ─── useKpiData ─────────────────────────────────────────────────────────
/**
 * Fetch KPI data, monthly chart data, and rubro distribution.
 */
export function useKpiData(year, month) {
  const [data, setData] = useState({
    kpis: mockKpiData,
    monthlyData: mockMonthlyData,
    rubroDistribution: mockRubroDistribution,
    taxData: mockTaxDeclarations,
  });
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    setLoading(true);

    (async () => {
      try {
        const backendUp = await checkBackend();
        if (backendUp) {
          const response = await satApi.getStats({ year, month });
          if (response.success && response.data) {
            const { kpis, monthlyData: md, rubroDistribution: rd, taxData: td } = response.data;

            // Only use live data if there are actual invoices
            if (kpis.totalFacturas > 0) {
              setData({
                kpis,
                monthlyData: md,
                rubroDistribution: rd.length > 0 ? rd : mockRubroDistribution,
                taxData: td,
              });
              setIsLive(true);
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('useKpiData: using mock data', err.message);
      }

      // Fallback to mock
      setData({
        kpis: mockKpiData,
        monthlyData: mockMonthlyData,
        rubroDistribution: mockRubroDistribution,
        taxData: mockTaxDeclarations,
      });
      setIsLive(false);
      setLoading(false);
    })();
  }, [year, month]);

  return { ...data, loading, isLive };
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
 * Fetch retenciones (withholding tax) data.
 * Falls back to mock data if backend unavailable.
 */
export function useRetenciones() {
  const [retenciones, setRetenciones] = useState(mockRetenciones);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const backendUp = await checkBackend();
        if (backendUp) {
          // Retenciones come from CFDIs with tipo_comprobante that have retenciones
          const response = await satApi.getCfdis({ limit: 200 });
          if (response.success && response.data?.invoices?.length > 0) {
            const withRetenciones = response.data.invoices
              .filter(inv => (inv.isr_retenido > 0 || inv.iva_retenido > 0))
              .map((inv, idx) => ({
                id: String(idx + 1),
                folio: `RET-${String(idx + 1).padStart(4, '0')}`,
                receptor: inv.razon_social,
                rfc: inv.rfc,
                tipo_retencion: inv.isr_retenido > 0 ? 'ISR Servicios Profesionales' : 'IVA Arrendamiento',
                fecha: inv.fecha,
                base: inv.subtotal,
                tasa: inv.isr_retenido > 0 ? 10 : 10.6667,
                monto_retenido: inv.isr_retenido || 0,
                iva_retenido: inv.iva_retenido || 0,
                total_retenido: (inv.isr_retenido || 0) + (inv.iva_retenido || 0),
                status: 'timbrada',
                factura_vinculada: `${inv.serie}${inv.folio}`,
              }));

            if (withRetenciones.length > 0) {
              setRetenciones(withRetenciones);
              setIsLive(true);
            }
          }
        }
      } catch (err) {
        console.warn('useRetenciones: using mock data', err.message);
      }
      setLoading(false);
    })();
  }, []);

  return { retenciones, loading, isLive };
}
