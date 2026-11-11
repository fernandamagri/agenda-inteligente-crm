// npm run restaurar -- <archivo> --probar     → restaura, verifica y deshace (no cambia nada)
// npm run restaurar -- <archivo> --confirmar  → reemplaza TODOS los datos por los de la copia
import { readFileSync } from 'node:fs';
import { pool } from './db.js';
import { resumenCopia, restaurarCopia, validarCopia } from './copias.js';

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith('--'));
const probar = args.includes('--probar');
const confirmar = args.includes('--confirmar');

if (!archivo || (!probar && !confirmar)) {
  console.log(`
Uso:
  npm run restaurar -- backups/copia-AAAA-MM-DD-HHMM.json --probar
      Restaura la copia, verifica que quede completa y deshace todo. No cambia nada.

  npm run restaurar -- backups/copia-AAAA-MM-DD-HHMM.json --confirmar
      Reemplaza TODOS los datos actuales (también los de la app online) por los de la copia.
      Todos van a tener que volver a iniciar sesión.
`);
  process.exit(0);
}

try {
  let copia;
  try {
    copia = JSON.parse(readFileSync(archivo, 'utf8'));
  } catch {
    throw new Error('No se pudo leer el archivo (¿existe y es una copia en formato JSON?).');
  }
  validarCopia(copia);
  console.log(`Copia del ${new Date(copia.creada).toLocaleString('es-AR', { hour12: false })}:`);
  console.log(Object.entries(resumenCopia(copia)).map(([t, n]) => `  ${t}: ${n}`).join('\n'));

  const verificacion = await restaurarCopia(copia, { soloProbar: probar });
  const ok = Object.values(verificacion).every((v) => v.esperadas === v.restauradas);
  if (probar) {
    console.log(ok ? '\nPrueba OK: la copia se restauró completa y se deshizo. La base no cambió.' : '\nLa prueba no coincidió.');
  } else {
    console.log('\nListo: la base quedó igual que en la copia. Todos tienen que volver a iniciar sesión.');
  }
} catch (err) {
  console.error('\nNo se restauró nada:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
