// Búsqueda global: un texto busca en clientes, contactos, oportunidades, tareas y actividades.
// Usa las mismas consultas con permisos del resto del CRM: cada uno encuentra solo lo suyo.
import { listar } from './crm.js';

/** Minúsculas y sin acentos: "Reunión" y "reunion" se encuentran igual. */
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FUENTES = {
  clientes: { campos: ['nombre', 'empresa', 'email', 'telefono', 'notas'], titulo: (x) => x.nombre, detalle: (x) => x.empresa || x.email },
  contactos: { campos: ['nombre', 'email', 'telefono', 'cargo', 'notas'], titulo: (x) => x.nombre, detalle: (x) => [x.cargo, x.cliente].filter(Boolean).join(' · ') },
  oportunidades: { campos: ['titulo'], titulo: (x) => x.titulo, detalle: (x) => x.cliente },
  tareas: { campos: ['titulo', 'descripcion'], titulo: (x) => x.titulo, detalle: (x) => x.cliente || 'Sin cliente' },
  actividades: { campos: ['titulo', 'descripcion'], titulo: (x) => x.titulo, detalle: (x) => x.cliente },
};

const MAX_POR_TIPO = 6;

export async function buscar(usuario, texto) {
  const q = normalizar(texto).trim();
  if (q.length < 2) return { q: texto, grupos: [] };
  const palabras = q.split(/\s+/);

  const grupos = await Promise.all(
    Object.entries(FUENTES).map(async ([tipo, f]) => {
      const filas = await listar(tipo, usuario);
      const coincidencias = filas.filter((fila) => {
        // Para clientes también cuenta el nombre del cliente en sí; en el resto, el cliente asociado.
        const texto = normalizar([...f.campos.map((c) => fila[c]), fila.cliente].join(' '));
        return palabras.every((p) => texto.includes(p));
      });
      return {
        tipo,
        total: coincidencias.length,
        items: coincidencias.slice(0, MAX_POR_TIPO).map((x) => ({
          id: x.id,
          cliente_id: tipo === 'clientes' ? x.id : x.cliente_id ?? null,
          titulo: f.titulo(x),
          detalle: f.detalle(x) || '',
          estado: x.estado || x.etapa || x.tipo || null,
        })),
      };
    })
  );
  return { q: texto, grupos: grupos.filter((g) => g.total > 0) };
}
