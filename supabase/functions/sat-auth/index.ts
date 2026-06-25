import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { decode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import forge from "npm:node-forge";
import { SignedXml } from "npm:xml-crypto";
import { DOMParser } from "npm:@xmldom/xmldom";

// ─── 1. CORS HEADERS ──────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── UTILS ────────────────────────────────────────────────────────────────────

/**
 * Convierte un certificado X509 (DER binario) a formato PEM
 */
function derToPem(derBuffer: Uint8Array, type: "CERTIFICATE" | "PRIVATE KEY"): string {
  const base64 = forge.util.encode64(forge.util.createBuffer(derBuffer).getBytes());
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----\n`;
}

/**
 * Desencripta una llave privada (PKCS#8 en DER) usando su contraseña y devuelve su PEM
 */
function decryptPrivateKey(encryptedKeyDer: Uint8Array, password: string): string {
  const derBuffer = forge.util.createBuffer(encryptedKeyDer);
  const asn1 = forge.asn1.fromDer(derBuffer);
  
  // Desencriptar PKCS#8
  const privateKey = forge.pki.decryptPrivateKeyInfo(asn1, password);
  if (!privateKey) {
    throw new Error("Contraseña incorrecta o formato de llave inválido");
  }
  
  return forge.pki.privateKeyToPem(privateKey);
}

// ─── 2. FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────
serve(async (req) => {
  // Manejo del pre-flight de CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { cerBase64, keyBase64, password } = await req.json();

    if (!cerBase64 || !keyBase64 || !password) {
      return new Response(
        JSON.stringify({ error: "Faltan parámetros (cerBase64, keyBase64, password)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 2.1 RECUPERACIÓN Y CONVERSIÓN DE BASE64 A BINARIO ──────────────────
    // decode de std/encoding devuelve un Uint8Array (binario)
    const cerBuffer = decode(cerBase64);
    const keyBuffer = decode(keyBase64);

    // Convertir el certificado (.cer) de DER a PEM para xml-crypto
    const cerPem = derToPem(cerBuffer, "CERTIFICATE");
    
    // Desencriptar la llave privada (.key) y obtener su PEM
    const privateKeyPem = decryptPrivateKey(keyBuffer, password);
    
    // Extraer el certificado en base64 puro sin cabeceras PEM (necesario para el BinarySecurityToken)
    const cerB64Raw = cerPem
      .replace("-----BEGIN CERTIFICATE-----", "")
      .replace("-----END CERTIFICATE-----", "")
      .replace(/\s/g, "");

    // ─── 3. GENERACIÓN Y FIRMA DEL REQUEST SOAP ──────────────────────────────
    
    // Fechas en formato ISO requeridas por el SAT (Timestamp)
    const now = new Date();
    const created = now.toISOString();
    now.setMinutes(now.getMinutes() + 5);
    const expires = now.toISOString();

    // Template del SOAP Envelope para Autenticación SAT
    const xmlStr = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <s:Header>
        <o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
          <u:Timestamp u:Id="_0">
            <u:Created>${created}</u:Created>
            <u:Expires>${expires}</u:Expires>
          </u:Timestamp>
          <o:BinarySecurityToken u:Id="uuid-token" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${cerB64Raw}</o:BinarySecurityToken>
        </o:Security>
      </s:Header>
      <s:Body>
        <Autentica xmlns="http://DescargaMasivaTerceros.sat.gob.mx" />
      </s:Body>
    </s:Envelope>`;

    // Iniciar el proceso de firma con xml-crypto
    const sig = new SignedXml();
    // Añadimos el Timestamp como la referencia a firmar
    sig.addReference(
      "//*[@u:Id='_0']",
      ["http://www.w3.org/2001/10/xml-exc-c14n#"],
      "http://www.w3.org/2000/09/xmldsig#sha1"
    );

    // Configurar los algoritmos y la llave privada
    sig.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
    sig.signingKey = privateKeyPem;
    
    // Customizar la inyección de la firma dentro del tag <o:Security>
    sig.computeSignature(xmlStr, {
      location: { reference: "//*[@u:Id='uuid-token']", action: "after" },
    });

    const signedXml = sig.getSignedXml();

    // En Deno (y navegadores), a veces es útil inyectar el KeyInfo explícitamente 
    // apuntando al BinarySecurityToken.
    const parser = new DOMParser();
    const doc = parser.parseFromString(signedXml, "text/xml");
    
    // Inyectamos el KeyInfo para hacer referencia al SecurityToken (obligatorio para el SAT)
    const signatureNode = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
    const keyInfoNode = doc.createElementNS("http://www.w3.org/2000/09/xmldsig#", "KeyInfo");
    const secTokenRef = doc.createElementNS("http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd", "o:SecurityTokenReference");
    const ref = doc.createElementNS("http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd", "o:Reference");
    ref.setAttribute("URI", "#uuid-token");
    ref.setAttribute("ValueType", "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3");
    
    secTokenRef.appendChild(ref);
    keyInfoNode.appendChild(secTokenRef);
    signatureNode.appendChild(keyInfoNode);

    // El XML final listo para ser enviado
    const finalSoapEnvelope = doc.toString();

    // ─── 4. PETICIÓN AL SAT Y RETORNO DEL TOKEN ───────────────────────────────
    
    const satResponse = await fetch("https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://DescargaMasivaTerceros.sat.gob.mx/IAutenticacion/Autentica"
      },
      body: finalSoapEnvelope,
    });

    const satXmlResponse = await satResponse.text();

    if (!satResponse.ok) {
      console.error("Error del SAT:", satXmlResponse);
      throw new Error(`SAT respondió con status ${satResponse.status}`);
    }

    // Extraer el token de acceso (el contenido del tag <AutenticaResult>)
    const responseDoc = parser.parseFromString(satXmlResponse, "text/xml");
    const resultNode = responseDoc.getElementsByTagName("AutenticaResult")[0];
    
    if (!resultNode || !resultNode.textContent) {
      throw new Error("No se pudo extraer el AutenticaResult del SAT");
    }

    // El token devuelto es del estilo: wrap_access_token="string_aqui..."
    const tokenData = resultNode.textContent;
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        token: tokenData,
        message: "Autenticación exitosa ante el SAT"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error en sat-auth:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
