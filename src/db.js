import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { relativaISO } from './fechas.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const DB_DIR = path.join(aqui, '..', 'data');
export const DB_PATH = path.join(DB_DIR, 'crm.db');

mkdirSync(DB_DIR, { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL CHECK (rol IN ('vendedor','admin')),
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  empresa TEXT,
  estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','caliente','negociacion','cerrado')),
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  notas TEXT
);
CREATE TABLE IF NOT EXISTS contactos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  cargo TEXT,
  notas TEXT
);
CREATE TABLE IF NOT EXISTS oportunidades (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  monto REAL,
  etapa TEXT NOT NULL DEFAULT 'prospecto' CHECK (etapa IN ('prospecto','propuesta','negociacion','cerrado')),
  fecha_cambio_etapa TEXT NOT NULL,
  probabilidad INTEGER CHECK (probabilidad BETWEEN 0 AND 100),
  fecha_cierre TEXT,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS tareas (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha_limite TEXT,
  prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_progreso','completada')),
  asignado_id INTEGER NOT NULL REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS actividades (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('llamada','reunion','email','visita')),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha TEXT NOT NULL,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id)
);
`);

/**
 * Datos de ejemplo. Para Ana replican exactamente los de docs/TESTING.md
 * (fecha de prueba = hoy), así los casos de prueba se pueden repetir.
 * Las fechas son relativas a hoy para que la demo siga teniendo sentido otro día.
 */
export function cargarDatosDeEjemplo() {
  const pass = hashPassword('demo123');
  const insUsuario = db.prepare('INSERT INTO usuarios (nombre, email, rol, password_hash) VALUES (?, ?, ?, ?)');
  const ana = insUsuario.run('Ana', 'ana@demo.com', 'vendedor', pass).lastInsertRowid;
  const luis = insUsuario.run('Luis', 'luis@demo.com', 'vendedor', pass).lastInsertRowid;
  insUsuario.run('Carla (administradora)', 'admin@demo.com', 'admin', pass);

  const insCliente = db.prepare(
    'INSERT INTO clientes (nombre, email, telefono, empresa, estado, responsable_id, notas) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const acme = insCliente.run('Acme', 'ventas@acme.com', '11 4555-1001', 'Acme S.A.', 'caliente', ana, 'Pidió información de precios').lastInsertRowid;
  const globex = insCliente.run('Globex', 'info@globex.com', '11 4555-2002', 'Globex S.R.L.', 'negociacion', ana, null).lastInsertRowid;
  const initech = insCliente.run('Initech', 'hola@initech.com', null, 'Initech S.A.', 'nuevo', luis, null).lastInsertRowid;
  const hooli = insCliente.run('Hooli', 'compras@hooli.com', '11 4555-3003', 'Hooli Argentina', 'caliente', luis, 'Interesados en consultoría').lastInsertRowid;
  const stark = insCliente.run('Stark', 'admin@stark.com', '11 4555-4004', 'Stark Industrias', 'cerrado', luis, 'Compró el plan anual').lastInsertRowid;

  const insContacto = db.prepare(
    'INSERT INTO contactos (cliente_id, nombre, email, telefono, cargo, notas) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insContacto.run(acme, 'Marta Gómez', 'marta@acme.com', '11 6000-1111', 'Jefa de Compras', null);
  insContacto.run(hooli, 'Diego Paz', 'diego@hooli.com', '11 6000-2222', 'Gerente de Operaciones', null);
  insContacto.run(stark, 'Paula Ríos', 'paula@stark.com', '11 6000-3333', 'Administración', null);

  const insOpo = db.prepare(
    'INSERT INTO oportunidades (cliente_id, titulo, monto, etapa, fecha_cambio_etapa, probabilidad, fecha_cierre, responsable_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insOpo.run(globex, 'Licencias anuales', 1200000, 'negociacion', relativaISO(-4), 60, relativaISO(20), ana);
  insOpo.run(acme, 'Equipamiento', null, 'propuesta', relativaISO(-21), 40, relativaISO(30), ana);
  insOpo.run(hooli, 'Consultoría', 500000, 'propuesta', relativaISO(-16), 50, relativaISO(15), luis);
  insOpo.run(stark, 'Plan anual', 900000, 'cerrado', relativaISO(-35), 100, relativaISO(-35), luis);

  const insTarea = db.prepare(
    'INSERT INTO tareas (cliente_id, titulo, descripcion, fecha_limite, prioridad, estado, asignado_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insTarea.run(acme, 'Enviar propuesta', 'Propuesta de equipamiento', relativaISO(-1), 'alta', 'pendiente', ana);
  insTarea.run(globex, 'Llamar para revisar propuesta', null, relativaISO(0), 'media', 'pendiente', ana);
  insTarea.run(initech, 'Primer contacto', 'Llamada de presentación', relativaISO(-3), 'alta', 'pendiente', luis);
  insTarea.run(hooli, 'Preparar demo', null, relativaISO(1), 'media', 'en_progreso', luis);

  const insAct = db.prepare(
    'INSERT INTO actividades (cliente_id, tipo, titulo, descripcion, fecha, responsable_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insAct.run(acme, 'llamada', 'Consulta inicial', 'Pidió información de precios', relativaISO(-5), ana);
  insAct.run(globex, 'reunion', 'Reunión de negociación', 'Revisión de la propuesta de licencias', relativaISO(-4), ana);
  insAct.run(hooli, 'reunion', 'Relevamiento', 'Relevamiento de necesidades', relativaISO(-6), luis);
  insAct.run(stark, 'email', 'Confirmación de compra', null, relativaISO(-35), luis);
}

const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
if (total === 0) cargarDatosDeEjemplo();
