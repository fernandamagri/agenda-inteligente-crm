// Cuentas de usuario: cambio de contraseña, pedidos de "olvidé mi contraseña"
// y administración de usuarios (solo administrador).
import { ejecutar, todos, uno } from './db.js';
import { hashPassword, passwordTemporal, problemaConPassword, verificarPassword } from './claves.js';
import { cerrarSesionesDe } from './sesiones.js';
import { ErrorCRM } from './crm.js';

/** Las cuentas de prueba tienen la contraseña fija demo123 para que la demo siempre funcione. */
export const esCuentaDemo = (email) => /@demo\.com$/i.test(email);

const ROLES = ['vendedor', 'admin'];
const exigirAdmin = (u) => {
  if (u.rol !== 'admin') throw new ErrorCRM('Solo el administrador puede hacer esto.', 403);
};

function limpiarEmail(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) throw new ErrorCRM('Escribí un email válido.');
  return e;
}

function limpiarNombre(nombre) {
  const n = String(nombre ?? '').trim();
  if (!n) throw new ErrorCRM('Escribí el nombre.');
  if (n.length > 120) throw new ErrorCRM('El nombre es demasiado largo.');
  return n;
}

// ---------------------------------------------------------------------------
// Para cualquier usuario
// ---------------------------------------------------------------------------

export async function cambiarPassword(usuario, actual, nueva, tokenActual) {
  const fila = await uno('SELECT email, password_hash FROM usuarios WHERE id = :id', { id: usuario.id });
  if (esCuentaDemo(fila.email)) {
    throw new ErrorCRM('Las cuentas de prueba tienen la contraseña fija (demo123) para que la demo siempre funcione.');
  }
  if (!verificarPassword(String(actual ?? ''), fila.password_hash)) throw new ErrorCRM('La contraseña actual no es correcta.');
  const problema = problemaConPassword(nueva);
  if (problema) throw new ErrorCRM(problema);
  if (nueva === actual) throw new ErrorCRM('La contraseña nueva tiene que ser distinta de la actual.');

  await ejecutar('UPDATE usuarios SET password_hash = :h, debe_cambiar_password = false WHERE id = :id', {
    h: hashPassword(nueva),
    id: usuario.id,
  });
  await cerrarSesionesDe(usuario.id, tokenActual); // cierra la sesión en otros dispositivos
}

/**
 * Pedido de "olvidé mi contraseña". Responde siempre lo mismo, exista o no el email,
 * para no revelar qué cuentas existen.
 */
export async function pedirRestablecimiento(email) {
  let e;
  try {
    e = limpiarEmail(email);
  } catch {
    return;
  }
  const u = await uno('SELECT id FROM usuarios WHERE email = :e AND activo', { e });
  if (!u || esCuentaDemo(e)) return;
  await ejecutar(
    `INSERT INTO solicitudes_password (usuario_id) VALUES (:u)
     ON CONFLICT (usuario_id) WHERE estado = 'pendiente' DO NOTHING`,
    { u: u.id }
  );
}

// ---------------------------------------------------------------------------
// Administración (solo administrador)
// ---------------------------------------------------------------------------

export async function listarUsuariosAdmin(admin) {
  exigirAdmin(admin);
  return todos(`
    SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.debe_cambiar_password, u.creado,
           (SELECT COUNT(*)::int FROM clientes c WHERE c.responsable_id = u.id) AS clientes,
           EXISTS (SELECT 1 FROM solicitudes_password s WHERE s.usuario_id = u.id AND s.estado = 'pendiente') AS pidio_password
      FROM usuarios u
     ORDER BY u.activo DESC, lower(u.nombre)`);
}

export async function listarSolicitudes(admin) {
  exigirAdmin(admin);
  return todos(`
    SELECT s.id, s.creada, u.id AS usuario_id, u.nombre, u.email
      FROM solicitudes_password s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.estado = 'pendiente'
     ORDER BY s.creada`);
}

export async function crearUsuario(admin, datos) {
  exigirAdmin(admin);
  const nombre = limpiarNombre(datos?.nombre);
  const email = limpiarEmail(datos?.email);
  const rol = ROLES.includes(datos?.rol) ? datos.rol : 'vendedor';
  if (await uno('SELECT 1 FROM usuarios WHERE email = :email', { email })) {
    throw new ErrorCRM('Ya existe un usuario con ese email.');
  }
  const temporal = passwordTemporal();
  const fila = await uno(
    `INSERT INTO usuarios (nombre, email, rol, password_hash, debe_cambiar_password)
     VALUES (:nombre, :email, :rol, :h, true) RETURNING id, nombre, email, rol`,
    { nombre, email, rol, h: hashPassword(temporal) }
  );
  return { usuario: fila, passwordTemporal: temporal };
}

async function contarAdminsActivos(exceptoId) {
  const r = await uno("SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'admin' AND activo AND id <> :id", { id: exceptoId });
  return r.n;
}

export async function actualizarUsuario(admin, id, datos) {
  exigirAdmin(admin);
  const actual = await uno('SELECT * FROM usuarios WHERE id = :id', { id });
  if (!actual) throw new ErrorCRM('No se encontró el usuario.', 404);

  const nombre = 'nombre' in datos ? limpiarNombre(datos.nombre) : actual.nombre;
  const email = 'email' in datos ? limpiarEmail(datos.email) : actual.email;
  const rol = 'rol' in datos ? datos.rol : actual.rol;
  const activo = 'activo' in datos ? Boolean(datos.activo) : actual.activo;
  if (!ROLES.includes(rol)) throw new ErrorCRM('Rol inválido.');

  if (email !== actual.email && (await uno('SELECT 1 FROM usuarios WHERE email = :email AND id <> :id', { email, id }))) {
    throw new ErrorCRM('Ya existe un usuario con ese email.');
  }
  if (esCuentaDemo(actual.email) && email !== actual.email) {
    throw new ErrorCRM('No se puede cambiar el email de una cuenta de prueba.');
  }
  // Que nunca quede el sistema sin un administrador activo.
  if (actual.rol === 'admin' && actual.activo && (rol !== 'admin' || !activo) && (await contarAdminsActivos(id)) === 0) {
    throw new ErrorCRM('Tiene que quedar al menos un administrador activo.');
  }
  if (id === admin.id && !activo) throw new ErrorCRM('No podés desactivar tu propia cuenta.');

  await ejecutar('UPDATE usuarios SET nombre = :nombre, email = :email, rol = :rol, activo = :activo WHERE id = :id', {
    nombre, email, rol, activo, id,
  });
  if (!activo) {
    await cerrarSesionesDe(id);
    await ejecutar("UPDATE solicitudes_password SET estado = 'descartada', resuelta = now() WHERE usuario_id = :id AND estado = 'pendiente'", { id });
  }
  return uno('SELECT id, nombre, email, rol, activo, debe_cambiar_password FROM usuarios WHERE id = :id', { id });
}

/** Genera una contraseña temporal; el usuario tiene que cambiarla al entrar. */
export async function restablecerPassword(admin, id) {
  exigirAdmin(admin);
  const u = await uno('SELECT id, nombre, email, activo FROM usuarios WHERE id = :id', { id });
  if (!u) throw new ErrorCRM('No se encontró el usuario.', 404);
  if (esCuentaDemo(u.email)) {
    throw new ErrorCRM('Las cuentas de prueba tienen la contraseña fija (demo123). Probá con un usuario creado por vos.');
  }
  if (!u.activo) throw new ErrorCRM('La cuenta está desactivada. Activala primero.');

  const temporal = passwordTemporal();
  await ejecutar('UPDATE usuarios SET password_hash = :h, debe_cambiar_password = true WHERE id = :id', {
    h: hashPassword(temporal),
    id,
  });
  await cerrarSesionesDe(id);
  await ejecutar("UPDATE solicitudes_password SET estado = 'resuelta', resuelta = now() WHERE usuario_id = :id AND estado = 'pendiente'", { id });
  return { usuario: { id: u.id, nombre: u.nombre, email: u.email }, passwordTemporal: temporal };
}

export async function descartarSolicitud(admin, id) {
  exigirAdmin(admin);
  await ejecutar("UPDATE solicitudes_password SET estado = 'descartada', resuelta = now() WHERE id = :id AND estado = 'pendiente'", { id });
}
