import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verificarPassword(password, guardado) {
  const [salt, hash] = String(guardado).split(':');
  if (!salt || !hash) return false;
  const esperado = Buffer.from(hash, 'hex');
  const calculado = scryptSync(password, salt, 64);
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
}

/** Sesiones en memoria: token -> { usuarioId, conversacion } */
const sesiones = new Map();
export const COOKIE = 'sesion';

export function crearSesion(usuarioId) {
  const token = randomBytes(32).toString('hex');
  sesiones.set(token, { usuarioId, conversacion: [] });
  return token;
}

export function obtenerSesion(token) {
  return token ? sesiones.get(token) : undefined;
}

export function cerrarSesion(token) {
  sesiones.delete(token);
}

export function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie || '';
  for (const parte of cabecera.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return undefined;
}
