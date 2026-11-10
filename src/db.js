// Conexión a la base de datos Postgres (Supabase). La dirección viene de DATABASE_URL.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './claves.js';
import { relativaISO } from './fechas.js';

// Las fechas (tipo DATE) se leen como texto "AAAA-MM-DD", igual que las maneja la app.
pg.types.setTypeParser(1082, (v) => v);

if (!process.env.DATABASE_URL) {
  console.error(
    '\nFalta DATABASE_URL: la dirección de la base de datos Postgres.\n' +
      'En Supabase: Project Settings → Database → Connection string (Session pooler).\n' +
      'Agregala al archivo .env (local) o a las variables de entorno de Render.\n'
  );
  process.exit(1);
}

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: false },
  max: 5,
});
pool.on('error', (err) => console.error('[db] error en una conexión inactiva:', err.message));

/**
 * Convierte parámetros con nombre (:yo, :id) a los de Postgres ($1, $2).
 * Los "::tipo" de Postgres no se tocan.
 */
function conNombres(sql, params) {
  if (Array.isArray(params) || params === undefined) return [sql, params];
  const valores = [];
  const posiciones = {};
  const texto = sql.replace(/(?<!:):([a-z_][a-z0-9_]*)/gi, (_, nombre) => {
    if (!(nombre in params)) throw new Error(`Falta el parámetro :${nombre}`);
    posiciones[nombre] ??= valores.push(params[nombre]);
    return `$${posiciones[nombre]}`;
  });
  return [texto, valores];
}

export async function todos(sql, params) {
  const [texto, valores] = conNombres(sql, params);
  return (await pool.query(texto, valores)).rows;
}

export async function uno(sql, params) {
  return (await todos(sql, params))[0];
}

export async function ejecutar(sql, params) {
  const [texto, valores] = conNombres(sql, params);
  return pool.query(texto, valores);
}

// ---------------------------------------------------------------------------
// Esquema y datos de ejemplo
// ---------------------------------------------------------------------------

const ESQUEMA = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'esquema.sql'), 'utf8');

/**
 * Datos de ejemplo. Para Ana replican exactamente los de docs/TESTING.md
 * (fecha de prueba = día de la carga), así los casos de prueba se pueden repetir.
 */
export async function cargarDatosDeEjemplo() {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const ins = async (sql, valores) => (await cliente.query(`${sql} RETURNING id`, valores)).rows[0].id;
    const pass = hashPassword('demo123');

    const insUsuario = 'INSERT INTO usuarios (nombre, email, rol, password_hash) VALUES ($1, $2, $3, $4)';
    const ana = await ins(insUsuario, ['Ana', 'ana@demo.com', 'vendedor', pass]);
    const luis = await ins(insUsuario, ['Luis', 'luis@demo.com', 'vendedor', pass]);
    await ins(insUsuario, ['Carla (administradora)', 'admin@demo.com', 'admin', pass]);

    const insCliente = 'INSERT INTO clientes (nombre, email, telefono, empresa, estado, responsable_id, notas) VALUES ($1, $2, $3, $4, $5, $6, $7)';
    const acme = await ins(insCliente, ['Acme', 'ventas@acme.com', '11 4555-1001', 'Acme S.A.', 'caliente', ana, 'Pidió información de precios']);
    const globex = await ins(insCliente, ['Globex', 'info@globex.com', '11 4555-2002', 'Globex S.R.L.', 'negociacion', ana, null]);
    const initech = await ins(insCliente, ['Initech', 'hola@initech.com', null, 'Initech S.A.', 'nuevo', luis, null]);
    const hooli = await ins(insCliente, ['Hooli', 'compras@hooli.com', '11 4555-3003', 'Hooli Argentina', 'caliente', luis, 'Interesados en consultoría']);
    const stark = await ins(insCliente, ['Stark', 'admin@stark.com', '11 4555-4004', 'Stark Industrias', 'cerrado', luis, 'Compró el plan anual']);

    const insContacto = 'INSERT INTO contactos (cliente_id, nombre, email, telefono, cargo, notas) VALUES ($1, $2, $3, $4, $5, $6)';
    await ins(insContacto, [acme, 'Marta Gómez', 'marta@acme.com', '11 6000-1111', 'Jefa de Compras', null]);
    await ins(insContacto, [hooli, 'Diego Paz', 'diego@hooli.com', '11 6000-2222', 'Gerente de Operaciones', null]);
    await ins(insContacto, [stark, 'Paula Ríos', 'paula@stark.com', '11 6000-3333', 'Administración', null]);

    const insOpo = 'INSERT INTO oportunidades (cliente_id, titulo, monto, etapa, fecha_cambio_etapa, probabilidad, fecha_cierre, responsable_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
    await ins(insOpo, [globex, 'Licencias anuales', 1200000, 'negociacion', relativaISO(-4), 60, relativaISO(20), ana]);
    await ins(insOpo, [acme, 'Equipamiento', null, 'propuesta', relativaISO(-21), 40, relativaISO(30), ana]);
    await ins(insOpo, [hooli, 'Consultoría', 500000, 'propuesta', relativaISO(-16), 50, relativaISO(15), luis]);
    await ins(insOpo, [stark, 'Plan anual', 900000, 'cerrado', relativaISO(-35), 100, relativaISO(-35), luis]);

    const insTarea = 'INSERT INTO tareas (cliente_id, titulo, descripcion, fecha_limite, prioridad, estado, asignado_id) VALUES ($1, $2, $3, $4, $5, $6, $7)';
    await ins(insTarea, [acme, 'Enviar propuesta', 'Propuesta de equipamiento', relativaISO(-1), 'alta', 'pendiente', ana]);
    await ins(insTarea, [globex, 'Llamar para revisar propuesta', null, relativaISO(0), 'media', 'pendiente', ana]);
    await ins(insTarea, [initech, 'Primer contacto', 'Llamada de presentación', relativaISO(-3), 'alta', 'pendiente', luis]);
    await ins(insTarea, [hooli, 'Preparar demo', null, relativaISO(1), 'media', 'en_progreso', luis]);

    const insAct = 'INSERT INTO actividades (cliente_id, tipo, titulo, descripcion, fecha, responsable_id) VALUES ($1, $2, $3, $4, $5, $6)';
    await ins(insAct, [acme, 'llamada', 'Consulta inicial', 'Pidió información de precios', relativaISO(-5), ana]);
    await ins(insAct, [globex, 'reunion', 'Reunión de negociación', 'Revisión de la propuesta de licencias', relativaISO(-4), ana]);
    await ins(insAct, [hooli, 'reunion', 'Relevamiento', 'Relevamiento de necesidades', relativaISO(-6), luis]);
    await ins(insAct, [stark, 'email', 'Confirmación de compra', null, relativaISO(-35), luis]);

    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

/** Crea las tablas si faltan y carga los datos de ejemplo solo si la base está vacía. */
export async function prepararBase() {
  await pool.query(ESQUEMA);
  const { total } = await uno('SELECT COUNT(*)::int AS total FROM usuarios');
  if (total === 0) {
    await cargarDatosDeEjemplo();
    console.log('Base de datos vacía: se cargaron los datos de ejemplo.');
  }
}

/** Borra todos los datos y vuelve a cargar los de ejemplo. */
export async function reiniciarBase() {
  await pool.query(ESQUEMA);
  await pool.query('TRUNCATE actividades, tareas, oportunidades, contactos, clientes, usuarios RESTART IDENTITY CASCADE');
  await cargarDatosDeEjemplo();
}
