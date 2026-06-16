import fs from 'fs';
import path from 'path';

/**
 * Resuelve y extrae el contenido binario de una credencial del SAT (CER o KEY).
 * Capaz de manejar entornos locales (rutas físicas) y producción (cadenas Base64).
 * 
 * @param {string} envValue - Valor de la variable de entorno (ruta o base64).
 * @param {string} type - Tipo de archivo ('cer' o 'key') para mensajes de error.
 * @returns {Buffer} El contenido del archivo como Buffer binario.
 * @throws {Error} Si el valor no existe, la ruta es inválida, o el Base64 es corrupto.
 */
export function resolveCredentialContent(envValue, type = 'credencial') {
  if (!envValue || envValue.trim() === '') {
    throw new Error(`El valor de la variable de entorno para ${type} está vacío o no fue proporcionado.`);
  }

  const value = envValue.trim();

  // 1. Intentar leer como ruta de archivo local
  try {
    const resolvedPath = path.resolve(value);
    // Verificamos si el archivo existe físicamente y no es un directorio
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      return fs.readFileSync(resolvedPath);
    }
  } catch (err) {
    // Si falla la resolución de la ruta, ignoramos y asumimos que es Base64
  }

  // 2. Si no es una ruta física válida, asumimos que es una cadena en Base64.
  // Limpiamos prefijos de Data URI en caso de que existan (ej. data:application/pkcs8;base64,...)
  const base64Data = value.replace(/^data:[a-zA-Z0-9-+/.]+;base64,/, '');

  // Validamos heurísticamente si parece un string Base64 válido
  // Los Base64 solo contienen caracteres alfanuméricos, +, /, y terminan en =
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  
  if (!base64Regex.test(base64Data)) {
    throw new Error(`El contenido para ${type} no es una ruta de archivo local válida y tampoco parece ser un formato Base64 correcto.`);
  }

  // Convertimos la cadena Base64 a un Buffer binario
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length === 0) {
    throw new Error(`La decodificación Base64 para ${type} resultó en un archivo vacío.`);
  }

  return buffer;
}
