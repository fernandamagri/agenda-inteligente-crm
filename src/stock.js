// Stock: Mercado Libre vs Proges + Planet.com. Solo lectura.
// Los datos los calcula la app ml-stock-sync (última comparación guardada); el CRM solo los muestra.
import { ErrorCRM } from './crm.js';

const URL_APP = (process.env.ML_STOCK_SYNC_URL || 'https://ml-stock-sync.onrender.com').replace(/\/$/, '');

const CAMPOS_FILA = ['status', 'ean', 'title', 'proges_name', 'ml_id', 'ml_stock', 'proges_stock', 'planet_stock', 'internal_stock', 'diff', 'permalink'];

export async function comparacionStock(usuario) {
  if (usuario.rol !== 'admin') throw new ErrorCRM('Solo el administrador puede ver el stock.', 403);

  let res;
  try {
    // La app está en un plan gratis de Render y puede tardar ~1 minuto en despertar.
    res = await fetch(`${URL_APP}/api/compare/last`, { signal: AbortSignal.timeout(90_000) });
  } catch {
    throw new ErrorCRM('No se pudo conectar con la app de stock (ml-stock-sync). Probá de nuevo en un minuto.', 502);
  }
  if (res.status === 404) return { urlApp: URL_APP, cuentas: [] };
  if (!res.ok) throw new ErrorCRM(`La app de stock respondió con un error (${res.status}).`, 502);

  const { accounts = {} } = await res.json();
  const cuentas = Object.entries(accounts).map(([id, a]) => ({
    id,
    nombre: a.label || id,
    conectada: Boolean(a.connected),
    resumen: a.summary ?? null,
    // Solo los campos que se muestran (no se reenvían costos ni otros datos internos).
    filas: (a.rows ?? []).map((r) => Object.fromEntries(CAMPOS_FILA.map((k) => [k, r[k] ?? null]))),
  }));
  return { urlApp: URL_APP, cuentas };
}

// --- Carga de listas (Proges / Planet.com) y nueva comparación ---------------------------

const soloAdmin = (usuario) => {
  if (usuario.rol !== 'admin') throw new ErrorCRM('Solo el administrador puede cargar listas de stock.', 403);
};

async function llamarApp(ruta, opciones = {}, segundos = 90) {
  try {
    return await fetch(`${URL_APP}${ruta}`, { ...opciones, signal: AbortSignal.timeout(segundos * 1000) });
  } catch {
    throw new ErrorCRM('No se pudo conectar con la app de stock (ml-stock-sync). Probá de nuevo en un minuto.', 502);
  }
}

/** Cuándo se subió cada lista y cuántos productos tiene. */
export async function estadoListas(usuario) {
  soloAdmin(usuario);
  const res = await llamarApp('/api/status');
  if (!res.ok) throw new ErrorCRM(`La app de stock respondió con un error (${res.status}).`, 502);
  const s = await res.json();
  return {
    proges: { subida: s.proges_uploaded_at, productos: s.proges_products, origen: s.proges_source },
    planet: { subida: s.planet_uploaded_at, productos: s.planet_products, origen: s.planet_source },
  };
}

const TIPOS = {
  proges: { ruta: '/api/proges/upload', extensiones: ['.xlsx', '.xls'], nombre: 'Proges' },
  planet: { ruta: '/api/planet/upload', extensiones: ['.pdf', '.xlsx', '.xls'], nombre: 'Planet.com' },
};

/** Reenvía el archivo a ml-stock-sync, que lo lee y lo guarda. */
export async function subirLista(usuario, tipo, contenido, nombreArchivo, tipoArchivo) {
  soloAdmin(usuario);
  const t = TIPOS[tipo];
  if (!t) throw new ErrorCRM('Tipo de lista desconocido.', 404);
  if (!Buffer.isBuffer(contenido) || contenido.length === 0) throw new ErrorCRM('No se recibió ningún archivo.');
  const nombre = String(nombreArchivo || 'archivo').slice(0, 200);
  if (!t.extensiones.some((e) => nombre.toLowerCase().endsWith(e))) {
    throw new ErrorCRM(`Para ${t.nombre} el archivo tiene que ser ${t.extensiones.join(', ')}.`);
  }
  const form = new FormData();
  form.append('file', new Blob([contenido], { type: tipoArchivo || 'application/octet-stream' }), nombre);
  const res = await llamarApp(t.ruta, { method: 'POST', body: form });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErrorCRM(datos.error || `No se pudo cargar la lista de ${t.nombre} (${res.status}).`, res.status === 400 ? 400 : 502);
  return { ok: true, productos: datos.products };
}

/** Vuelve a comparar con el stock actual de Mercado Libre (puede tardar 1-2 minutos). */
export async function actualizarComparacion(usuario) {
  soloAdmin(usuario);
  const res = await llamarApp('/api/compare', {}, 240);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErrorCRM(datos.error || `No se pudo actualizar la comparación (${res.status}).`, 502);
  const errores = Object.values(datos.accounts ?? {}).filter((a) => a.error).map((a) => `${a.label}: ${a.error}`);
  return { ok: true, errores };
}
