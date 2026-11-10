// Borra la base y la vuelve a crear con los datos de ejemplo.
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ruta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'crm.db');
for (const sufijo of ['', '-wal', '-shm']) rmSync(ruta + sufijo, { force: true });

await import('./db.js');
console.log('Base de datos reiniciada con los datos de ejemplo.');
