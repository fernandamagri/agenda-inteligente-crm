// Contraseñas: hash seguro (scrypt) y generación de contraseñas temporales.
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

export const LARGO_MINIMO = 8;

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

// Sin letras ni números que se confundan al dictarlos o copiarlos (0/O, 1/l/I).
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Contraseña temporal fácil de pasar por WhatsApp: 10 caracteres, por ejemplo "Kp7rW2mXa9". */
export function passwordTemporal() {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/** Devuelve un mensaje de error si la contraseña nueva no sirve, o null si está bien. */
export function problemaConPassword(nueva) {
  if (typeof nueva !== 'string' || nueva.length < LARGO_MINIMO) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO} caracteres.`;
  }
  if (nueva.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-z]/.test(nueva) || !/[0-9]/.test(nueva)) return 'La contraseña tiene que tener letras y números.';
  return null;
}
