// Agenda Inteligente: el asistente comercial, construido sobre la API de Claude.
// Sus instrucciones son los documentos de diseño de la carpeta docs/.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listar, conDias } from './crm.js';
import { fechaLarga, hoyISO } from './fechas.js';

export const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const MAX_TURNOS = 30;

const DOCS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
// TESTING.md queda afuera a propósito: contiene datos ficticios y respuestas esperadas,
// y el asistente solo debe responder con los datos reales del CRM.
const DOCUMENTOS = ['LEGEND.md', 'AGENTS.md', 'CONTEXT.md', 'TASK.md'];

const INTEGRACION = `Estás integrado en la aplicación web del CRM. Los documentos que siguen definen quién sos, con qué información trabajás y cómo respondés; seguilos tal como están escritos, respetando su jerarquía de instrucciones.

Cómo recibís los datos en esta aplicación:
- Cada mensaje del usuario llega acompañado de un bloque <datos_crm> con la foto actual del CRM. Es tu única fuente de datos. Si en la conversación hay varios bloques, vale el más reciente (el usuario puede haber cargado o cambiado cosas en el medio).
- Ese bloque ya viene filtrado según los permisos del usuario: un vendedor solo recibe sus propios registros. Si te preguntan por un cliente que no aparece, respondé que no está entre los clientes del usuario, sin suponer nada más sobre él.
- Los campos que empiezan con "dias_" ya están calculados respecto de la fecha de hoy indicada en el bloque. Usalos tal cual en vez de hacer cuentas con fechas. Un valor null significa que no hay dato.
- El usuario no ve el bloque <datos_crm>: no lo menciones ni hables de "JSON", "campos" o "bloques"; hablá de "el CRM".
- Escribí en Markdown simple: negritas, listas, tablas y citas (>). No uses títulos grandes.`;

function cargarSistema() {
  const partes = DOCUMENTOS.map((nombre) => {
    const texto = readFileSync(path.join(DOCS_DIR, nombre), 'utf8');
    return `<documento nombre="${nombre}">\n${texto.trim()}\n</documento>`;
  });
  return `${INTEGRACION}\n\n${partes.join('\n\n')}`;
}

// Se lee una sola vez: un system prompt estable aprovecha el caché de prompts.
const SISTEMA = cargarSistema();

/** Foto del CRM visible para el usuario, con los días ya calculados. */
export async function fotoCRM(usuario) {
  const sinIds = (fila) => {
    const { password_hash, responsable_id, asignado_id, cliente_id, ...resto } = fila;
    return resto;
  };
  const tabla = async (nombre) => (await listar(nombre, usuario)).map((f) => sinIds(conDias(nombre, f)));
  const [clientes, contactos, oportunidades, tareas, actividades] = await Promise.all(
    ['clientes', 'contactos', 'oportunidades', 'tareas', 'actividades'].map(tabla)
  );
  return {
    fecha_de_hoy: `${fechaLarga(hoyISO())} (${hoyISO()})`,
    usuario: { nombre: usuario.nombre, rol: usuario.rol === 'admin' ? 'administrador' : 'vendedor' },
    clientes,
    contactos,
    oportunidades,
    tareas,
    actividades,
  };
}

let cliente;
function obtenerCliente() {
  // Toma las credenciales del entorno (ANTHROPIC_API_KEY, normalmente desde el archivo .env).
  cliente ??= new Anthropic();
  return cliente;
}

export function credencialesConfiguradas() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function mensajeDeError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'La clave de la API de Claude no es válida. Revisá ANTHROPIC_API_KEY en el archivo .env y reiniciá la app.';
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'La clave de la API no tiene permiso para usar este modelo.';
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Se alcanzó el límite de uso de la API. Probá de nuevo en un momento.';
  }
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(err.message)) {
      return 'Por ahora no contamos con el asistente disponible. Mientras tanto, en Inicio tenés tu agenda del día, tus tareas vencidas y las oportunidades frenadas.';
    }
    return `La API rechazó el pedido: ${err.message}`;
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'No se pudo conectar con la API de Claude. Revisá la conexión a internet.';
  }
  if (err instanceof Anthropic.APIError) {
    return `Error de la API de Claude (${err.status ?? 'sin código'}). Probá de nuevo.`;
  }
  if (/api[_ ]?key|credential|auth/i.test(String(err?.message))) {
    return 'Falta configurar la clave de la API de Claude. Copiá .env.example como .env, completá ANTHROPIC_API_KEY y reiniciá la app.';
  }
  return 'Ocurrió un error inesperado al consultar al asistente.';
}

/**
 * Envía un mensaje al asistente y transmite la respuesta en partes.
 * `emitir` recibe eventos { type: 'text' | 'reset' | 'aviso' | 'error' | 'done', ... }.
 * La conversación se guarda completa (incluidos los bloques de razonamiento) y solo se agrega al final.
 */
export async function conversar(sesion, usuario, mensaje, emitir, señal) {
  if (sesion.conversacion.length >= MAX_TURNOS * 2) {
    sesion.conversacion = [];
    emitir({ type: 'aviso', text: 'La conversación era muy larga, así que empecé una nueva.' });
  }

  let foto;
  try {
    foto = await fotoCRM(usuario);
  } catch (err) {
    console.error('[asistente] no se pudieron leer los datos del CRM', err);
    emitir({ type: 'error', message: 'No se pudieron leer los datos del CRM. Probá de nuevo en un momento.' });
    return;
  }

  const turnoUsuario = {
    role: 'user',
    content: [
      { type: 'text', text: `<datos_crm>\n${JSON.stringify(foto, null, 1)}\n</datos_crm>` },
      { type: 'text', text: mensaje },
    ],
  };
  const mensajes = [...sesion.conversacion, turnoUsuario];

  try {
    const stream = obtenerCliente().beta.messages.stream(
      {
        model: MODELO,
        max_tokens: 16000,
        system: SISTEMA,
        messages: mensajes,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        // Si el modelo declina por un filtro de seguridad, la API reintenta con otro modelo.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal: señal }
    );

    for await (const evento of stream) {
      if (evento.type === 'content_block_start' && evento.content_block.type === 'fallback') {
        // Otro modelo retoma la respuesta: se descarta el texto parcial ya mostrado.
        emitir({ type: 'reset' });
      } else if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
        emitir({ type: 'text', text: evento.delta.text });
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      emitir({ type: 'error', message: 'El asistente no puede responder ese pedido. Probá reformularlo.' });
      return; // no se guarda el turno rechazado
    }
    if (final.stop_reason === 'max_tokens') {
      emitir({ type: 'aviso', text: 'La respuesta quedó cortada por ser demasiado larga.' });
    }
    sesion.conversacion.push(turnoUsuario, { role: 'assistant', content: final.content });
    emitir({ type: 'done' });
  } catch (err) {
    if (señal?.aborted) return;
    console.error('[asistente]', err);
    emitir({ type: 'error', message: mensajeDeError(err) });
  }
}
