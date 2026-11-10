// Acceso a los datos del CRM con permisos: el vendedor solo ve y toca lo suyo; el administrador, todo.
import { db } from './db.js';
import { diasDesde, esFechaValida, hoyISO } from './fechas.js';

export class ErrorCRM extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

const esAdmin = (u) => u.rol === 'admin';

// ---------------------------------------------------------------------------
// Definición de entidades
// ---------------------------------------------------------------------------

const ENUMS = {
  estadoCliente: ['nuevo', 'caliente', 'negociacion', 'cerrado'],
  etapa: ['prospecto', 'propuesta', 'negociacion', 'cerrado'],
  prioridad: ['baja', 'media', 'alta'],
  estadoTarea: ['pendiente', 'en_progreso', 'completada'],
  tipoActividad: ['llamada', 'reunion', 'email', 'visita'],
};

/**
 * campos: nombre -> { tipo, requerido?, valores? }
 * dueno: campo que indica el vendedor dueño del registro (o null si depende del cliente).
 * select: consulta base con alias de la tabla principal `x`; filtroVendedor: condición para un vendedor.
 */
export const ENTIDADES = {
  clientes: {
    tabla: 'clientes',
    campos: {
      nombre: { tipo: 'texto', requerido: true },
      email: { tipo: 'texto' },
      telefono: { tipo: 'texto' },
      empresa: { tipo: 'texto' },
      estado: { tipo: 'enum', valores: ENUMS.estadoCliente, requerido: true },
      responsable_id: { tipo: 'usuario' },
      notas: { tipo: 'texto' },
    },
    dueno: 'responsable_id',
    select: `SELECT x.*, u.nombre AS responsable,
               (SELECT MAX(a.fecha) FROM actividades a WHERE a.cliente_id = x.id) AS ultima_actividad
             FROM clientes x JOIN usuarios u ON u.id = x.responsable_id`,
    filtroVendedor: 'x.responsable_id = :yo',
    orden: 'x.nombre COLLATE NOCASE',
  },
  contactos: {
    tabla: 'contactos',
    campos: {
      cliente_id: { tipo: 'cliente', requerido: true },
      nombre: { tipo: 'texto', requerido: true },
      email: { tipo: 'texto' },
      telefono: { tipo: 'texto' },
      cargo: { tipo: 'texto' },
      notas: { tipo: 'texto' },
    },
    dueno: null,
    select: `SELECT x.*, c.nombre AS cliente FROM contactos x JOIN clientes c ON c.id = x.cliente_id`,
    filtroVendedor: 'c.responsable_id = :yo',
    orden: 'c.nombre COLLATE NOCASE, x.nombre COLLATE NOCASE',
  },
  oportunidades: {
    tabla: 'oportunidades',
    campos: {
      cliente_id: { tipo: 'cliente', requerido: true },
      titulo: { tipo: 'texto', requerido: true },
      monto: { tipo: 'numero' },
      etapa: { tipo: 'enum', valores: ENUMS.etapa, requerido: true },
      probabilidad: { tipo: 'porcentaje' },
      fecha_cierre: { tipo: 'fecha' },
      responsable_id: { tipo: 'usuario' },
    },
    dueno: 'responsable_id',
    select: `SELECT x.*, c.nombre AS cliente, u.nombre AS responsable
             FROM oportunidades x JOIN clientes c ON c.id = x.cliente_id JOIN usuarios u ON u.id = x.responsable_id`,
    filtroVendedor: 'x.responsable_id = :yo',
    orden: 'x.fecha_cierre IS NULL, x.fecha_cierre',
  },
  tareas: {
    tabla: 'tareas',
    campos: {
      cliente_id: { tipo: 'cliente' },
      titulo: { tipo: 'texto', requerido: true },
      descripcion: { tipo: 'texto' },
      fecha_limite: { tipo: 'fecha' },
      prioridad: { tipo: 'enum', valores: ENUMS.prioridad, requerido: true },
      estado: { tipo: 'enum', valores: ENUMS.estadoTarea, requerido: true },
      asignado_id: { tipo: 'usuario' },
    },
    dueno: 'asignado_id',
    select: `SELECT x.*, c.nombre AS cliente, u.nombre AS asignado
             FROM tareas x LEFT JOIN clientes c ON c.id = x.cliente_id JOIN usuarios u ON u.id = x.asignado_id`,
    filtroVendedor: 'x.asignado_id = :yo',
    orden: "x.estado = 'completada', x.fecha_limite IS NULL, x.fecha_limite",
  },
  actividades: {
    tabla: 'actividades',
    campos: {
      cliente_id: { tipo: 'cliente', requerido: true },
      tipo: { tipo: 'enum', valores: ENUMS.tipoActividad, requerido: true },
      titulo: { tipo: 'texto', requerido: true },
      descripcion: { tipo: 'texto' },
      fecha: { tipo: 'fecha', requerido: true },
      responsable_id: { tipo: 'usuario' },
    },
    dueno: 'responsable_id',
    select: `SELECT x.*, c.nombre AS cliente, u.nombre AS responsable
             FROM actividades x JOIN clientes c ON c.id = x.cliente_id JOIN usuarios u ON u.id = x.responsable_id`,
    filtroVendedor: 'x.responsable_id = :yo',
    orden: 'x.fecha DESC, x.id DESC',
  },
};

function entidad(nombre) {
  const e = ENTIDADES[nombre];
  if (!e) throw new ErrorCRM('Entidad desconocida', 404);
  return e;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export function listar(nombre, usuario) {
  const e = entidad(nombre);
  if (esAdmin(usuario)) {
    return db.prepare(`${e.select} ORDER BY ${e.orden}`).all();
  }
  return db.prepare(`${e.select} WHERE ${e.filtroVendedor} ORDER BY ${e.orden}`).all({ yo: usuario.id });
}

export function obtener(nombre, usuario, id) {
  const e = entidad(nombre);
  const fila = esAdmin(usuario)
    ? db.prepare(`${e.select} WHERE x.id = :id`).get({ id })
    : db.prepare(`${e.select} WHERE x.id = :id AND ${e.filtroVendedor}`).get({ id, yo: usuario.id });
  // Mismo mensaje exista o no: un vendedor no debe enterarse de registros ajenos.
  if (!fila) throw new ErrorCRM('No se encontró el registro entre tus datos.', 404);
  return fila;
}

export function listarUsuarios(usuario) {
  const sql = 'SELECT id, nombre, email, rol FROM usuarios';
  return esAdmin(usuario)
    ? db.prepare(`${sql} ORDER BY nombre`).all()
    : db.prepare(`${sql} WHERE id = ?`).all(usuario.id);
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

function limpiar(e, datos, usuario, parcial) {
  const salida = {};
  for (const [campo, def] of Object.entries(e.campos)) {
    if (!(campo in datos)) {
      if (!parcial && def.requerido) throw new ErrorCRM(`Falta el campo "${campo}".`);
      continue;
    }
    let v = datos[campo];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) v = null;

    if (v === null) {
      if (def.requerido) throw new ErrorCRM(`El campo "${campo}" es obligatorio.`);
      salida[campo] = null;
      continue;
    }

    switch (def.tipo) {
      case 'texto':
        if (typeof v !== 'string') throw new ErrorCRM(`"${campo}" debe ser texto.`);
        if (v.length > 2000) throw new ErrorCRM(`"${campo}" es demasiado largo.`);
        break;
      case 'enum':
        if (!def.valores.includes(v)) throw new ErrorCRM(`"${campo}" debe ser uno de: ${def.valores.join(', ')}.`);
        break;
      case 'fecha':
        if (!esFechaValida(v)) throw new ErrorCRM(`"${campo}" debe ser una fecha válida (AAAA-MM-DD).`);
        break;
      case 'numero':
        v = Number(v);
        if (!Number.isFinite(v) || v < 0) throw new ErrorCRM(`"${campo}" debe ser un número positivo.`);
        break;
      case 'porcentaje':
        v = Number(v);
        if (!Number.isInteger(v) || v < 0 || v > 100) throw new ErrorCRM(`"${campo}" debe ser un entero entre 0 y 100.`);
        break;
      case 'cliente': {
        v = Number(v);
        const c = db.prepare('SELECT responsable_id FROM clientes WHERE id = ?').get(v);
        if (!c || (!esAdmin(usuario) && c.responsable_id !== usuario.id)) {
          throw new ErrorCRM('El cliente elegido no está entre tus clientes.');
        }
        break;
      }
      case 'usuario': {
        v = Number(v);
        const u = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(v);
        if (!u) throw new ErrorCRM('El usuario elegido no existe.');
        break;
      }
    }
    salida[campo] = v;
  }

  // El vendedor siempre es el dueño de lo que crea o edita.
  if (e.dueno) {
    if (!esAdmin(usuario)) salida[e.dueno] = usuario.id;
    else if (!parcial && salida[e.dueno] == null) salida[e.dueno] = usuario.id;
  }
  return salida;
}

export function crear(nombre, usuario, datos) {
  const e = entidad(nombre);
  const valores = limpiar(e, datos || {}, usuario, false);
  if (nombre === 'oportunidades') valores.fecha_cambio_etapa = hoyISO();
  const cols = Object.keys(valores);
  const info = db
    .prepare(`INSERT INTO ${e.tabla} (${cols.join(', ')}) VALUES (${cols.map((c) => ':' + c).join(', ')})`)
    .run(valores);
  return obtener(nombre, usuario, Number(info.lastInsertRowid));
}

export function actualizar(nombre, usuario, id, datos) {
  const e = entidad(nombre);
  const actual = obtener(nombre, usuario, id); // valida permiso
  const valores = limpiar(e, datos || {}, usuario, true);
  if (nombre === 'oportunidades' && valores.etapa && valores.etapa !== actual.etapa) {
    valores.fecha_cambio_etapa = hoyISO();
  }
  const cols = Object.keys(valores);
  if (cols.length) {
    db.prepare(`UPDATE ${e.tabla} SET ${cols.map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`).run({ ...valores, id });
  }
  return obtener(nombre, usuario, id);
}

export function eliminar(nombre, usuario, id) {
  const e = entidad(nombre);
  obtener(nombre, usuario, id); // valida permiso
  db.prepare(`DELETE FROM ${e.tabla} WHERE id = ?`).run(id);
}

// ---------------------------------------------------------------------------
// Resumen del día (reglas del negocio de docs/CONTEXT.md)
// ---------------------------------------------------------------------------

export const DIAS_SIN_ACTIVIDAD = 3;
export const DIAS_OPORTUNIDAD_FRENADA = 14;

/** Agrega campos calculados de días para que el asistente no tenga que hacer cuentas. */
export function conDias(nombre, fila) {
  const f = { ...fila };
  if (nombre === 'tareas' && f.fecha_limite) {
    const d = diasDesde(f.fecha_limite);
    if (f.estado !== 'completada') {
      if (d > 0) f.dias_de_atraso = d;
      else f.dias_para_vencer = -d;
    }
  }
  if (nombre === 'clientes') {
    f.dias_sin_actividad = f.ultima_actividad ? diasDesde(f.ultima_actividad) : null;
  }
  if (nombre === 'oportunidades') {
    f.dias_sin_cambio_de_etapa = diasDesde(f.fecha_cambio_etapa);
  }
  return f;
}

export function calcularResumen(usuario) {
  const tareas = listar('tareas', usuario).map((t) => conDias('tareas', t)).filter((t) => t.estado !== 'completada');
  const clientes = listar('clientes', usuario).map((c) => conDias('clientes', c));
  const oportunidades = listar('oportunidades', usuario).map((o) => conDias('oportunidades', o));

  const tareasVencidas = tareas.filter((t) => t.dias_de_atraso > 0).sort((a, b) => b.dias_de_atraso - a.dias_de_atraso);
  const tareasHoy = tareas.filter((t) => t.dias_para_vencer === 0);
  const tareasProximas = tareas.filter((t) => t.dias_para_vencer > 0 && t.dias_para_vencer <= 2);
  const clientesSinActividad = clientes.filter(
    (c) =>
      ['caliente', 'negociacion'].includes(c.estado) &&
      (c.dias_sin_actividad === null || c.dias_sin_actividad > DIAS_SIN_ACTIVIDAD)
  );
  const oportunidadesFrenadas = oportunidades.filter(
    (o) => o.etapa !== 'cerrado' && o.dias_sin_cambio_de_etapa > DIAS_OPORTUNIDAD_FRENADA
  );
  const abiertas = oportunidades.filter((o) => o.etapa !== 'cerrado');

  return {
    fecha: hoyISO(),
    tareasVencidas,
    tareasHoy,
    tareasProximas,
    clientesSinActividad,
    oportunidadesFrenadas,
    totales: {
      clientes: clientes.length,
      tareasPendientes: tareas.length,
      oportunidadesAbiertas: abiertas.length,
      montoAbierto: abiertas.reduce((s, o) => s + (o.monto || 0), 0),
      oportunidadesSinMonto: abiertas.filter((o) => o.monto == null).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Ficha de cliente y próximo paso (regla 3 de docs/CONTEXT.md)
// ---------------------------------------------------------------------------

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function proximoPaso(cliente, oportunidades) {
  const dias = cliente.ultima_actividad ? diasDesde(cliente.ultima_actividad) : null;
  const ultima = dias === null ? 'No hay actividades registradas' : `La última actividad fue ${dias === 0 ? 'hoy' : `hace ${plural(dias, 'día', 'días')}`}`;

  switch (cliente.estado) {
    case 'nuevo':
      return {
        accion: 'Primer contacto: llamada o email de presentación',
        plazo: dias === null ? 'Dentro de las próximas 48 h' : 'Dentro de las 48 h, si todavía no hubo presentación',
        motivo: `Es un cliente nuevo. ${ultima}.`,
      };
    case 'caliente':
      return {
        accion: 'Enviar la propuesta o agendar una reunión',
        plazo: 'Esta semana',
        motivo: `Está caliente: es el momento de avanzar. ${ultima}.`,
      };
    case 'negociacion': {
      const toca = dias === null || dias >= 3;
      return {
        accion: 'Seguimiento para avanzar hacia el cierre',
        plazo: toca ? 'Hoy' : `En ${plural(3 - dias, 'día', 'días')}`,
        motivo: `En negociación corresponde un seguimiento cada 3 días. ${ultima}.`,
      };
    }
    case 'cerrado': {
      const cierres = oportunidades.filter((o) => o.etapa === 'cerrado').map((o) => o.fecha_cambio_etapa).sort();
      const desde = cierres.at(-1) ? diasDesde(cierres.at(-1)) : null;
      let plazo = 'A los 30 días del cierre';
      if (desde !== null) plazo = desde >= 30 ? 'Ya corresponde (pasaron más de 30 días del cierre)' : `En ${plural(30 - desde, 'día', 'días')}`;
      return {
        accion: 'Agradecimiento y consulta de satisfacción',
        plazo,
        motivo: desde === null ? 'El cliente está cerrado, pero no hay una oportunidad cerrada con fecha.' : `La venta se cerró hace ${plural(desde, 'día', 'días')}.`,
      };
    }
  }
  return null;
}

export function fichaCliente(usuario, id) {
  const cliente = conDias('clientes', obtener('clientes', usuario, id)); // valida permiso
  const deCliente = (nombre) => listar(nombre, usuario).filter((f) => f.cliente_id === id).map((f) => conDias(nombre, f));
  const oportunidades = deCliente('oportunidades');
  return {
    cliente,
    contactos: deCliente('contactos'),
    oportunidades,
    tareas: deCliente('tareas'),
    actividades: deCliente('actividades'),
    proximoPaso: proximoPaso(cliente, oportunidades),
  };
}

// ---------------------------------------------------------------------------
// Vista de equipo (solo administrador)
// ---------------------------------------------------------------------------

export function resumenEquipo(usuario) {
  if (!esAdmin(usuario)) throw new ErrorCRM('Solo el administrador puede ver el estado del equipo.', 403);
  const vendedores = db.prepare("SELECT id, nombre FROM usuarios WHERE rol = 'vendedor' ORDER BY nombre").all();
  return vendedores.map((v) => {
    const r = calcularResumen({ id: v.id, rol: 'vendedor' });
    return {
      id: v.id,
      nombre: v.nombre,
      ...r.totales,
      tareasVencidas: r.tareasVencidas,
      clientesSinActividad: r.clientesSinActividad,
      oportunidadesFrenadas: r.oportunidadesFrenadas,
    };
  });
}
