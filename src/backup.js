// npm run backup → guarda una copia de seguridad en la carpeta backups/ (y conserva las 30 más nuevas).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { crearCopia, resumenCopia } from './copias.js';

const CONSERVAR = 30;
const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backups');
mkdirSync(carpeta, { recursive: true });

try {
  const copia = await crearCopia();
  const ahora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const nombre = `copia-${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}-${p(ahora.getHours())}${p(ahora.getMinutes())}.json`;
  writeFileSync(path.join(carpeta, nombre), JSON.stringify(copia, null, 1));

  const resumen = resumenCopia(copia);
  console.log(`Copia guardada: backups/${nombre}`);
  console.log(Object.entries(resumen).map(([t, n]) => `  ${t}: ${n}`).join('\n'));

  // Rotación: borra las más viejas.
  const copias = readdirSync(carpeta).filter((f) => /^copia-.*\.json$/.test(f)).sort();
  for (const vieja of copias.slice(0, Math.max(0, copias.length - CONSERVAR))) rmSync(path.join(carpeta, vieja));
} catch (err) {
  console.error('No se pudo hacer la copia:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
