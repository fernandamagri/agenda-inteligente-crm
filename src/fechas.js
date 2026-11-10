// Utilidades de fechas. Todas las fechas se guardan como texto "AAAA-MM-DD" en hora local.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function aISO(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function hoyISO() {
  return aISO(new Date());
}

/** Fecha ISO desplazada `dias` respecto de hoy (negativo = pasado). */
export function relativaISO(dias) {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return aISO(f);
}

function aFechaLocal(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** Días transcurridos desde `iso` hasta hoy (positivo si `iso` es pasado). */
export function diasDesde(iso) {
  if (!iso) return null;
  const ms = aFechaLocal(hoyISO()) - aFechaLocal(iso);
  return Math.round(ms / 86400000);
}

export function esFechaValida(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return aISO(aFechaLocal(iso)) === iso;
}

/** "martes 10/11/2026" */
export function fechaLarga(iso) {
  const f = aFechaLocal(iso);
  const [a, m, d] = iso.split('-');
  return `${DIAS[f.getDay()]} ${d}/${m}/${a}`;
}

/** "10/11" */
export function fechaCorta(iso) {
  if (!iso) return null;
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
