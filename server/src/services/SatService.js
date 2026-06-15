// ─── SAT Web Service Client ─────────────────────────────────────────────
// Core service encapsulating all SAT Descarga Masiva WS logic (v1.5).
// Uses @nodecfdi/sat-ws-descarga-masiva for SOAP + WS-Security.
// ─────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';

/**
 * SatService — Manages authentication and communication with the SAT
 * Descarga Masiva Web Service.
 *
 * Endpoints (CFDI v1.5):
 *   Auth:     https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc
 *   Solicita: https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc
 *   Verifica: https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc
 *   Descarga: https://cfdidescargamasabordasolicitud.clouda.sat.gob.mx/DescargaMasivaService.svc
 *
 * Endpoints (Retenciones):
 *   Same structure but on: retendescargamasivasolicitud.clouda.sat.gob.mx
 */
export class SatService {
  constructor() {
    this._service = null;
    this._fiel = null;
    this._tokenExpiresAt = null;
    this._initialized = false;
    this._satWsModule = null;
    this._credentialsModule = null;
  }

  /**
   * Lazy-load the @nodecfdi modules (they use dynamic imports).
   */
  async _loadModules() {
    if (this._satWsModule) return;

    try {
      this._satWsModule = await import('@nodecfdi/sat-ws-descarga-masiva');
      this._credentialsModule = await import('@nodecfdi/credentials');
    } catch (err) {
      console.error('⚠️  @nodecfdi modules not installed. SAT WS calls will use fallback mode.');
      console.error('   Run: cd server && npm install');
      this._satWsModule = null;
      this._credentialsModule = null;
    }
  }

  /**
   * Load e.firma credentials from disk.
   * @param {string} cerPath - Path to .cer file
   * @param {string} keyPath - Path to .key file
   * @param {string} password - Password for the .key file
   * @returns {object} FIEL credential object
   */
  async loadCredentials(cerPath, keyPath, password) {
    await this._loadModules();

    if (!this._credentialsModule) {
      throw new Error('Módulo @nodecfdi/credentials no disponible. Ejecuta: cd server && npm install');
    }

    const resolvedCer = path.resolve(cerPath);
    const resolvedKey = path.resolve(keyPath);

    // Validate files exist
    if (!fs.existsSync(resolvedCer)) {
      throw new Error(`Archivo de certificado no encontrado: ${resolvedCer}`);
    }
    if (!fs.existsSync(resolvedKey)) {
      throw new Error(`Archivo de llave privada no encontrado: ${resolvedKey}`);
    }

    const { Credential } = this._credentialsModule;

    // Read certificate and key as binary
    const cerContent = fs.readFileSync(resolvedCer);
    const keyContent = fs.readFileSync(resolvedKey);

    // Create credential from DER-encoded files (as delivered by SAT)
    const credential = Credential.openFiles(
      cerContent.toString('binary'),
      keyContent.toString('binary'),
      password
    );

    return credential;
  }

  /**
   * Initialize the SAT service with e.firma credentials.
   * This creates the FIEL instance, validates it, and prepares
   * the service for authenticated requests.
   */
  async initialize() {
    const cerPath = process.env.SAT_CER_PATH;
    const keyPath = process.env.SAT_KEY_PATH;
    const password = process.env.SAT_KEY_PASSWORD;

    if (!cerPath || !keyPath || !password) {
      console.warn('⚠️  SAT credentials not configured. Set SAT_CER_PATH, SAT_KEY_PATH, SAT_KEY_PASSWORD in .env');
      return false;
    }

    try {
      await this._loadModules();

      if (!this._satWsModule || !this._credentialsModule) {
        console.warn('⚠️  SAT WS modules not available. Running in demo mode.');
        return false;
      }

      const credential = await this.loadCredentials(cerPath, keyPath, password);

      const {
        Fiel,
        FielRequestBuilder,
        Service,
        HttpsWebClient,
        ServiceEndpoints,
      } = this._satWsModule;

      // Create FIEL from credential
      this._fiel = new Fiel(credential);

      // Validate FIEL
      if (!this._fiel.isValid()) {
        throw new Error('La e.firma (FIEL) no es válida o ha expirado.');
      }

      // Create the request builder and web client
      const requestBuilder = new FielRequestBuilder(this._fiel);
      const webClient = new HttpsWebClient();

      // Use production CFDI endpoints
      const endpoints = ServiceEndpoints.cfdi();

      // Create the service
      this._service = new Service(requestBuilder, webClient, endpoints);
      this._initialized = true;

      console.log('✅ SAT Service initialized successfully');
      console.log(`   RFC: ${this.getRfc()}`);
      console.log(`   Certificate valid until: ${this.getCertificateExpiration()}`);

      return true;
    } catch (error) {
      console.error('❌ Error initializing SAT Service:', error.message);
      this._initialized = false;
      return false;
    }
  }

  /**
   * Check if the service is initialized and ready to make requests.
   */
  isReady() {
    return this._initialized && this._service !== null;
  }

  /**
   * Get the RFC associated with the e.firma.
   */
  getRfc() {
    if (!this._fiel) return process.env.SAT_RFC || 'N/A';
    try {
      return this._fiel.getRfc();
    } catch {
      return process.env.SAT_RFC || 'N/A';
    }
  }

  /**
   * Get certificate expiration date.
   */
  getCertificateExpiration() {
    if (!this._fiel) return null;
    try {
      return this._fiel.getCertificate().validTo().toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Get the certificate serial number.
   */
  getCertificateSerial() {
    if (!this._fiel) return null;
    try {
      return this._fiel.getCertificate().serialNumber().bytes();
    } catch {
      return null;
    }
  }

  /**
   * Authenticate with the SAT Web Service.
   * Obtains a token that's valid for ~5 minutes.
   * @returns {object} Authentication result
   */
  async authenticate() {
    if (!this.isReady()) {
      throw new Error('SAT Service not initialized. Call initialize() first.');
    }

    try {
      const authResult = await this._service.authenticate();
      this._tokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

      return {
        success: true,
        tokenExpiresAt: this._tokenExpiresAt.toISOString(),
      };
    } catch (error) {
      throw new Error(`Error de autenticación SAT: ${error.message}`);
    }
  }

  /**
   * Request a bulk download of emitted CFDIs.
   * @param {Date} dateStart - Start date
   * @param {Date} dateEnd - End date
   * @param {string} requestType - 'xml' or 'metadata'
   * @returns {object} { requestId, statusCode, message }
   */
  async requestDownloadEmitidos(dateStart, dateEnd, requestType = 'xml') {
    if (!this.isReady()) {
      throw new Error('SAT Service not initialized.');
    }

    try {
      const { QueryParameters, RequestType, DownloadType } = this._satWsModule;

      const parameters = QueryParameters.create(
        new Date(dateStart),
        new Date(dateEnd),
        requestType === 'xml' ? DownloadType.xml : DownloadType.metadata,
        RequestType.cfdi,
      );

      const result = await this._service.query(parameters);

      return {
        requestId: result.getRequestId(),
        statusCode: result.getStatusCode(),
        message: result.getMessage(),
      };
    } catch (error) {
      throw new Error(`Error en solicitud de emitidos: ${error.message}`);
    }
  }

  /**
   * Request a bulk download of received CFDIs.
   * @param {Date} dateStart - Start date
   * @param {Date} dateEnd - End date
   * @param {string} requestType - 'xml' or 'metadata'
   * @returns {object} { requestId, statusCode, message }
   */
  async requestDownloadRecibidos(dateStart, dateEnd, requestType = 'xml') {
    if (!this.isReady()) {
      throw new Error('SAT Service not initialized.');
    }

    try {
      const { QueryParameters, RequestType, DownloadType, ComplementoCfdi } = this._satWsModule;

      const parameters = QueryParameters.create(
        new Date(dateStart),
        new Date(dateEnd),
        requestType === 'xml' ? DownloadType.xml : DownloadType.metadata,
        RequestType.cfdi,
      );

      const result = await this._service.query(parameters);

      return {
        requestId: result.getRequestId(),
        statusCode: result.getStatusCode(),
        message: result.getMessage(),
      };
    } catch (error) {
      throw new Error(`Error en solicitud de recibidos: ${error.message}`);
    }
  }

  /**
   * Request download of a specific CFDI by UUID.
   * @param {string} uuid - The UUID (Folio Fiscal) of the CFDI
   * @returns {object} { requestId, statusCode, message }
   */
  async requestDownloadByUUID(uuid) {
    if (!this.isReady()) {
      throw new Error('SAT Service not initialized.');
    }

    try {
      const result = await this._service.queryByUuid(uuid);

      return {
        requestId: result.getRequestId(),
        statusCode: result.getStatusCode(),
        message: result.getMessage(),
      };
    } catch (error) {
      throw new Error(`Error en solicitud por UUID: ${error.message}`);
    }
  }

  /**
   * Verify the status of a download request.
   * Status codes:
   *   1 = Accepted
   *   2 = Processing
   *   3 = Completed (packages ready)
   *   4 = Error
   *   5 = Rejected
   *   6 = Expired
   *
   * @param {string} requestId - The request ID from a previous query
   * @returns {object} { status, statusCode, message, packageIds, cfdiCount }
   */
  async verifyRequest(requestId) {
    if (!this.isReady()) {
      throw new Error('SAT Service not initialized.');
    }

    try {
      const result = await this._service.verify(requestId);

      const statusMap = {
        1: 'accepted',
        2: 'processing',
        3: 'completed',
        4: 'error',
        5: 'rejected',
        6: 'expired',
      };

      return {
        status: statusMap[result.getStatusCode()] || 'unknown',
        statusCode: result.getStatusCode(),
        message: result.getMessage(),
        packageIds: result.getPackageIds() || [],
        cfdiCount: result.getNumberOfCfdis() || 0,
      };
    } catch (error) {
      throw new Error(`Error verificando solicitud: ${error.message}`);
    }
  }

  /**
   * Download a package (ZIP containing XML files).
   * @param {string} packageId - The package ID from a verified request
   * @returns {Buffer} The ZIP file contents
   */
  async downloadPackage(packageId) {
    if (!this.isReady()) {
      throw new Error('SAT Service not initialized.');
    }

    try {
      const result = await this._service.download(packageId);
      return result.getPackageContent();
    } catch (error) {
      throw new Error(`Error descargando paquete: ${error.message}`);
    }
  }

  /**
   * Get current service status for the frontend.
   */
  getStatus() {
    return {
      initialized: this._initialized,
      rfc: this.getRfc(),
      certificateExpiration: this.getCertificateExpiration(),
      certificateSerial: this.getCertificateSerial(),
      tokenValid: this._tokenExpiresAt ? new Date() < this._tokenExpiresAt : false,
      tokenExpiresAt: this._tokenExpiresAt?.toISOString() || null,
    };
  }
}

// Singleton instance
let satServiceInstance = null;

/**
 * Get the singleton SatService instance.
 * @returns {SatService}
 */
export function getSatService() {
  if (!satServiceInstance) {
    satServiceInstance = new SatService();
  }
  return satServiceInstance;
}
