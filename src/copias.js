// Copias de seguridad de la base: todo el CRM en un archivo JSON, y restauración desde ese archivo.
// Las sesiones no se copian: al restaurar, todos vuelven a iniciar sesión.
import { pool } from './db.js';

export const VERSION_COPIA = 1;

// En orden de dependencias: primero lo que otros referencian.
const TABLAS = ['usuarios', 'clientes', 'contactos', 'oportunidades', 'tareas', 'actividades', 'solicitudes_password'];

/** Lee todas las tablas y devuelve el objeto de la copia. */
export async function crearCopia() {
  const cliente = await pool.connect();
  try {
    // Una sola transacción de solo lectura: la copia es una foto consistente.
    await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tablas = {};
    for (const t of TABLAS) tablas[t] = (await cliente.query(`SELECT * FROM ${t} ORDER BY id`)).rows;
    await cliente.query('COMMIT');
    return { app: 'agenda-inteligente-crm', version: VERSION_COPIA, creada: new Date().toISOString(), tablas };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

export function resumenCopia(copia) {
  return Object.fromEntries(TABLAS.map((t) => [t, copia.tablas?.[t]?.length ?? 0]));
}

export function validarCopia(copia) {
  if (copia?.app !== 'agenda-inteligente-crm' || !copia.tablas) throw new Error('El archivo no es una copia de seguridad de esta app.');
  if (copia.version !== VERSION_COPIA) throw new Error(`Versión de copia no soportada (${copia.version}).`);
  for (const t of TABLAS) {
    if (!Array.isArray(copia.tablas[t])) throw new Error(`A la copia le falta la tabla "${t}".`);
  }
  if (!copia.tablas.usuarios.some((u) => u.rol === 'admin' && u.activo !== false)) {
    throw new Error('La copia no tiene ningún administrador activo: después nadie podría administrar la app.');
  }
}

/**
 * Reemplaza TODOS los datos por los de la copia, en una sola transacción:
 * si algo falla, la base queda exactamente como estaba.
 * Con `soloProbar`, hace todo, verifica y deshace (no cambia nada).
 */
export async function restaurarCopia(copia, { soloProbar = false } = {}) {
  validarCopia(copia);
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(`TRUNCATE ${[...TABLAS, 'sesiones'].join(', ')} RESTART IDENTITY CASCADE`);

    for (const t of TABLAS) {
      const filas = copia.tablas[t];
      if (!filas.length) continue;
      const columnas = (await cliente.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
        [t]
      )).rows.map((r) => r.column_name);
      // Solo las columnas que existen hoy en la tabla (por si la copia es de una versión anterior).
      const cols = columnas.filter((c) => filas.some((f) => c in f));
      for (const fila of filas) {
        const valores = cols.map((c) => fila[c] ?? null);
        await cliente.query(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
          valores
        );
      }
      // Que los próximos registros nuevos sigan después del id más alto restaurado.
      await cliente.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT MAX(id) FROM ${t}), 1))`, [t]);
    }

    // Verificación: cada tabla tiene que tener exactamente las filas de la copia.
    const verificacion = {};
    for (const t of TABLAS) {
      const { n } = (await cliente.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0];
      verificacion[t] = { esperadas: copia.tablas[t].length, restauradas: n };
      if (n !== copia.tablas[t].length) throw new Error(`La tabla ${t} quedó con ${n} filas y la copia tenía ${copia.tablas[t].length}.`);
    }

    await cliente.query(soloProbar ? 'ROLLBACK' : 'COMMIT');
    return verificacion;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}
