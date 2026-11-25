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
