// Exportación a Excel (.xlsx). Respeta los permisos: cada usuario exporta solo lo que puede ver.
import ExcelJS from 'exceljs';
import { ErrorCRM, listar } from './crm.js';
import { hoyISO } from './fechas.js';

const ETIQUETAS = {
  nuevo: 'Nuevo', caliente: 'Caliente', negociacion: 'Negociación', cerrado: 'Cerrado',
  prospecto: 'Prospecto', propuesta: 'Propuesta',
  baja: 'Baja', media: 'Media', alta: 'Alta',
  pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada',
  llamada: 'Llamada', reunion: 'Reunión', email: 'Email', visita: 'Visita',
};
const etiqueta = (v) => (v == null ? null : ETIQUETAS[v] ?? v);

/** "AAAA-MM-DD" → fecha de Excel (sin corrimiento por zona horaria). */
const fecha = (iso) => {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

const FORMATO = { fecha: 'dd/mm/yyyy', pesos: '"$"#,##0', porcentaje: '0"%"' };

/** Columnas de cada hoja: título, ancho, cómo sacar el valor y formato. */
const HOJAS = {
  clientes: {
    titulo: 'Clientes',
    columnas: [
      ['Nombre', 26, (x) => x.nombre],
      ['Empresa', 24, (x) => x.empresa],
      ['Estado', 13, (x) => etiqueta(x.estado)],
      ['Email', 28, (x) => x.email],
      ['Teléfono', 16, (x) => x.telefono],
      ['Responsable', 20, (x) => x.responsable],
      ['Última actividad', 16, (x) => fecha(x.ultima_actividad), 'fecha'],
      ['Notas', 40, (x) => x.notas],
    ],
  },
  oportunidades: {
    titulo: 'Oportunidades',
    columnas: [
      ['Título', 28, (x) => x.titulo],
      ['Cliente', 22, (x) => x.cliente],
      ['Monto', 15, (x) => x.monto, 'pesos'],
      ['Etapa', 13, (x) => etiqueta(x.etapa)],
      ['Probabilidad', 13, (x) => x.probabilidad, 'porcentaje'],
      ['Cierre estimado', 16, (x) => fecha(x.fecha_cierre), 'fecha'],
      ['Último cambio de etapa', 22, (x) => fecha(x.fecha_cambio_etapa), 'fecha'],
      ['Responsable', 20, (x) => x.responsable],
    ],
  },
  tareas: {
    titulo: 'Tareas',
    columnas: [
      ['Tarea', 30, (x) => x.titulo],
      ['Cliente', 22, (x) => x.cliente],
      ['Fecha límite', 14, (x) => fecha(x.fecha_limite), 'fecha'],
      ['Prioridad', 11, (x) => etiqueta(x.prioridad)],
      ['Estado', 13, (x) => etiqueta(x.estado)],
      ['Asignada a', 20, (x) => x.asignado],
      ['Descripción', 40, (x) => x.descripcion],
    ],
  },
  actividades: {
    titulo: 'Actividades',
    columnas: [
      ['Fecha', 12, (x) => fecha(x.fecha), 'fecha'],
      ['Tipo', 11, (x) => etiqueta(x.tipo)],
      ['Actividad', 30, (x) => x.titulo],
      ['Cliente', 22, (x) => x.cliente],
      ['Responsable', 20, (x) => x.responsable],
      ['Descripción', 40, (x) => x.descripcion],
    ],
  },
  contactos: {
    titulo: 'Contactos',
    columnas: [
      ['Nombre', 24, (x) => x.nombre],
      ['Cliente', 22, (x) => x.cliente],
      ['Cargo', 22, (x) => x.cargo],
      ['Email', 28, (x) => x.email],
      ['Teléfono', 16, (x) => x.telefono],
      ['Notas', 40, (x) => x.notas],
    ],
  },
};

export const EXPORTABLES = ['todo', ...Object.keys(HOJAS)];

async function agregarHoja(libro, nombre, usuario) {
  const def = HOJAS[nombre];
  const filas = await listar(nombre, usuario);
  const hoja = libro.addWorksheet(def.titulo, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = def.columnas.map(([header, width], i) => ({ header, key: `c${i}`, width }));

  for (const fila of filas) {
    hoja.addRow(Object.fromEntries(def.columnas.map(([, , valor], i) => [`c${i}`, valor(fila) ?? null])));
  }
  def.columnas.forEach(([, , , formato], i) => {
    if (formato) hoja.getColumn(i + 1).numFmt = FORMATO[formato];
  });

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FED' } };
  encabezado.alignment = { vertical: 'middle' };
  encabezado.height = 20;
  if (filas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.columnas.length } };
  return filas.length;
}

/** Devuelve { nombreArchivo, buffer } con una hoja o con todas. */
export async function exportarExcel(que, usuario) {
  if (!EXPORTABLES.includes(que)) throw new ErrorCRM('No se puede exportar eso.', 404);
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Agenda Inteligente CRM';
  libro.created = new Date();

  const nombres = que === 'todo' ? Object.keys(HOJAS) : [que];
  for (const nombre of nombres) await agregarHoja(libro, nombre, usuario);

  const buffer = await libro.xlsx.writeBuffer();
  return { nombreArchivo: `agenda-crm-${que}-${hoyISO()}.xlsx`, buffer };
}
