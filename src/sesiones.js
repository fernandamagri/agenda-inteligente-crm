// Sesiones guardadas en la base: sobreviven a reinicios del servidor.
// En la base se guarda solo el hash del token; el token viaja únicamente en la cookie.
import { createHash, randomBytes } from 'node:crypto';
import { ejecutar, uno } from './db.js';

export const COOKIE = 'sesion';
export const DURACION_DIAS = 30;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function crearSesion(usuarioId) {
  const token = randomBytes(32).toString('hex');
  await ejecutar(
    `INSERT INTO sesiones (token_hash, usuario_id, expira) VALUES (:h, :u, now() + make_interval(days => :d))`,
    { h: hashToken(token), u: usuarioId, d: DURACION_DIAS }
  );
  // Limpieza ocasional de sesiones vencidas.
  if (Math.random() < 0.1) await ejecutar('DELETE FROM sesiones WHERE expira < now()').catch(() => {});
  return token;
}

/** Usuario dueño de la sesión, si la sesión existe, no venció y la cuenta está activa. */
export async function usuarioDeSesion(token) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return undefined;
  return uno(
    `SELECT u.id, u.nombre, u.email, u.rol, u.debe_cambiar_password
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = :h AND s.expira > now() AND u.activo`,
    { h: hashToken(token) }
  );
}

export async function cerrarSesion(token) {
  if (token) await ejecutar('DELETE FROM sesiones WHERE token_hash = :h', { h: hashToken(token) });
}

/** Cierra todas las sesiones de un usuario, salvo (opcionalmente) la actual. */
export async function cerrarSesionesDe(usuarioId, exceptoToken) {
  if (exceptoToken) {
    await ejecutar('DELETE FROM sesiones WHERE usuario_id = :u AND token_hash <> :h', { u: usuarioId, h: hashToken(exceptoToken) });
  } else {
    await ejecutar('DELETE FROM sesiones WHERE usuario_id = :u', { u: usuarioId });
  }
}

export function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie || '';
  for (const parte of cabecera.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function cookieDeSesion(token, req) {
  const segura = req.secure ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURACION_DIAS * 86400}${segura}`;
}

export function cookieBorrada(req) {
  const segura = req.secure ? '; Secure' : '';
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${segura}`;
}

// ---------------------------------------------------------------------------
// Límite de intentos (en memoria): frena a quien intente adivinar contraseñas.
// ---------------------------------------------------------------------------

const intentos = new Map(); // clave -> { cuenta, desde }

/** true si la clave superó `max` intentos en los últimos `minutos`. */
export function bloqueado(clave, max, minutos) {
  const r = intentos.get(clave);
  if (!r) return false;
  if (Date.now() - r.desde > minutos * 60000) {
    intentos.delete(clave);
    return false;
  }
  return r.cuenta >= max;
}

export function registrarIntento(clave) {
  const r = intentos.get(clave);
  if (r) r.cuenta++;
  else intentos.set(clave, { cuenta: 1, desde: Date.now() });
  if (intentos.size > 5000) intentos.clear(); // evita crecer sin límite
}

export function limpiarIntentos(clave) {
  intentos.delete(clave);
}
