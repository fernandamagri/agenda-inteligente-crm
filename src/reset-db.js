// Borra TODOS los datos de la base y vuelve a cargar los de ejemplo.
// Como la base es la misma que usa la app online, pide confirmación explícita.
import { pool, reiniciarBase } from './db.js';

if (!process.argv.includes('--confirmar')) {
  console.log('\nEsto borra TODOS los datos del CRM (también los de la app online) y carga los de ejemplo.');
  console.log('Si estás seguro, ejecutá:  npm run reset-db -- --confirmar\n');
  process.exit(0);
}

await reiniciarBase();
await pool.end();
console.log('Base de datos reiniciada con los datos de ejemplo.');
