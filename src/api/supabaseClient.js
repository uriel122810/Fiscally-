import { createClient } from '@supabase/supabase-js';

// Función auxiliar para obtener variables de entorno de forma agnóstica (Vite o CRA)
const getEnvVariable = (key) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  return undefined;
};

// Obtenemos URL y Key, prefiriendo las variables VITE_ (estándar de Vite)
const supabaseUrl = getEnvVariable('VITE_SUPABASE_URL') || getEnvVariable('REACT_APP_SUPABASE_URL');
const supabaseKey = getEnvVariable('VITE_SUPABASE_ANON_KEY') || getEnvVariable('REACT_APP_SUPABASE_ANON_KEY');

// Validación estricta con alertas claras
if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
  console.error(
    `[Supabase Client Error]: La URL proporcionada no es válida o está vacía. 
    Verifica que tu archivo .env contenga la variable VITE_SUPABASE_URL (o REACT_APP_SUPABASE_URL)
    con una URL válida que empiece con http:// o https://. 
    Valor actual recibido: "${supabaseUrl}"`
  );
}

if (!supabaseKey) {
  console.error(
    `[Supabase Client Error]: La ANON_KEY está vacía o no se ha cargado correctamente.
    Verifica que tu archivo .env contenga VITE_SUPABASE_ANON_KEY (o REACT_APP_SUPABASE_ANON_KEY).`
  );
}

// Inicialización del cliente (solo si hay URL válida para evitar que rompa el render principal)
export const supabase = supabaseUrl && supabaseUrl.startsWith('http')
  ? createClient(supabaseUrl, supabaseKey)
  : null;
