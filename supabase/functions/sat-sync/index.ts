import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import forge from 'https://esm.sh/node-forge@1.3.1';

// Configuración CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL de Autenticación del SAT
const SAT_AUTH_URL = 'https://cfdidescargamasivasolicitud.sat.gob.mx/WebServiceDeclaracionesAsincronas/Modulos/Autenticacion/AutenticacionTecnologiaTerceros.svc';

serve(async (req) => {
  // Manejar el preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    if (!authHeader) {
      throw new Error('Authorization header is missing');
    }

    // Inicializar Supabase Client con las variables de entorno inyectadas
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // 1. Obtener el usuario autenticado
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Usuario no autorizado');
    }

    // El frontend enviará la contraseña en el cuerpo del request por seguridad
    const body = await req.json();
    const { efirmaPassword } = body;

    if (!efirmaPassword) {
      throw new Error('La contraseña de la e.firma es requerida');
    }

    // 2. Recuperar el Base64 de las llaves desde Supabase
    const { data: config, error: configError } = await supabaseClient
      .from('configuracion_sat')
      .select('cer_base64, key_base64, rfc')
      .eq('user_id', user.id)
      .single();

    if (configError || !config) {
      throw new Error('No se encontró configuración SAT para este usuario');
    }

    const { cer_base64, key_base64, rfc } = config;

    // 3. LOGICA DE AUTENTICACIÓN SAT (Criptografía con node-forge)
    // Extraer la llave privada (.key) desencriptándola con la contraseña
    const privateKeyDer = forge.util.decode64(key_base64);
    const privateKeyAsn1 = forge.asn1.fromDer(privateKeyDer);
    
    // El SAT suele usar PKCS#8 encriptado
    let privateKey;
    try {
      privateKey = forge.pki.decryptRsaPrivateKey(privateKeyAsn1, efirmaPassword);
      if (!privateKey) throw new Error('Contraseña incorrecta');
    } catch (e) {
      throw new Error('Error al desencriptar la llave privada. Verifica tu contraseña.');
    }

    // Formatear las fechas en UTC para el XML
    const now = new Date();
    const created = now.toISOString();
    const expires = new Date(now.getTime() + 5 * 60000).toISOString(); // 5 minutos de validez
    const uuidId = crypto.randomUUID();

    // Crear el XML a firmar (Digest)
    const xmlToSign = `<u:Timestamp xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" u:Id="_0"><u:Created>${created}</u:Created><u:Expires>${expires}</u:Expires></u:Timestamp>`;

    // Hashear y Firmar el XML con RSA-SHA1 (como lo exige este WS del SAT)
    const md = forge.md.sha1.create();
    md.update(xmlToSign, 'utf8');
    const signatureBytes = privateKey.sign(md);
    const signatureBase64 = forge.util.encode64(signatureBytes);

    // Obtener el valor del digest
    const digestValue = forge.util.encode64(md.digest().getBytes());

    // Extraer el certificado sin las cabeceras PEM para colocarlo en el SOAP
    const cerDer = forge.util.decode64(cer_base64);
    const cerAsn1 = forge.asn1.fromDer(cerDer);
    const cert = forge.pki.certificateFromAsn1(cerAsn1);
    const certPem = forge.pki.certificateToPem(cert);
    const certString = certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r|\n/g, '');

    // Construir el SOAP Envelope final
    const soapEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <s:Header>
          <o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
            <o:UsernameToken u:Id="uuid-${uuidId}-1">
              <o:Username>${rfc}</o:Username>
              <o:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${efirmaPassword}</o:Password>
            </o:UsernameToken>
            <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
              <SignedInfo>
                <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
                <Reference URI="#_0">
                  <Transforms>
                    <Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                  </Transforms>
                  <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
                  <DigestValue>${digestValue}</DigestValue>
                </Reference>
              </SignedInfo>
              <SignatureValue>${signatureBase64}</SignatureValue>
              <KeyInfo>
                <o:SecurityTokenReference>
                  <o:Reference ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" URI="#uuid-${uuidId}-2"/>
                </o:SecurityTokenReference>
              </KeyInfo>
            </Signature>
            <o:BinarySecurityToken u:Id="uuid-${uuidId}-2" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${certString}</o:BinarySecurityToken>
            ${xmlToSign}
          </o:Security>
        </s:Header>
        <s:Body>
          <Autentica xmlns="http://DescargaMasivaTerceros.sat.gob.mx"/>
        </s:Body>
      </s:Envelope>
    `;

    // 4. Hacer la petición POST al SAT
    const satResponse = await fetch(SAT_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        'SOAPAction': 'http://DescargaMasivaTerceros.sat.gob.mx/IAutenticacion/Autentica',
      },
      body: soapEnvelope.trim(),
    });

    const responseText = await satResponse.text();

    if (!satResponse.ok) {
      throw new Error(`Error en el SAT HTTP ${satResponse.status}: ${responseText}`);
    }

    // Extraer el Token del XML (AutenticaResult)
    const tokenMatch = responseText.match(/<AutenticaResult>(.*?)<\/AutenticaResult>/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) {
      throw new Error('El SAT no devolvió un Token válido');
    }

    // -------------------------------------------------------------
    // 5. SOLICITUD Y ALMACENAMIENTO (Ejemplo)
    // Con el Token en mano, aquí seguiría la llamada al endpoint de
    // SolicitaDescarga usando fetch() añadiendo el Token.
    // 
    // const solicitaEnvelope = `<s:Envelope>...</s:Envelope>`;
    // await fetch('https://cfdidescargamasivasolicitud.sat.gob.mx/WebServiceDeclaracionesAsincronas/Modulos/SolicitaDescarga.svc', {
    //   headers: { Authorization: `WRAP access_token="${token}"` }
    // });
    // 
    // Posterior a la descarga y parseo de los XML (CFDI), guardar en Supabase:
    // const { error: insertError } = await supabaseClient
    //   .from('facturas')
    //   .insert([
    //     {
    //       user_id: user.id,
    //       uuid_cfdi: 'A1B2C3-...',
    //       rfc_emisor: 'EMISOR123',
    //       rfc_receptor: rfc,
    //       total: 1000.50,
    //       fecha: '2026-06-16T12:00:00Z',
    //       // ...
    //     }
    //   ]);
    // -------------------------------------------------------------

    return new Response(JSON.stringify({ 
      success: true, 
      token: token,
      message: "¡Autenticación con el SAT exitosa! El token expirará en 5 minutos." 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
