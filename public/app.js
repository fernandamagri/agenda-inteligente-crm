'use strict';

// ===========================================================================
// Utilidades
// ===========================================================================

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function api(metodo, url, cuerpo) {
  const res = await fetch(url, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login' && url !== '/api/me') mostrarLogin();
  if (res.status === 403 && datos.debeCambiarPassword) mostrarCambioObligatorio();
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos;
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar('Copiado al portapapeles.');
  } catch {
    avisar('No se pudo copiar. Seleccioná el texto y copialo a mano.');
  }
}

/** Muestra el error de un formulario en su párrafo .error. */
function errorEn(form, mensaje) {
  const p = $('.error', form);
  p.textContent = mensaje || '';
  p.hidden = !mensaje;
}

function avisar(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (el.hidden = true), 2600);
}

function hoyISO() {
  const f = new Date();
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}
function fecha(iso) {
  if (!iso) return '<span class="falta">sin fecha</span>';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function diasDesde(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const [ha, hm, hd] = hoyISO().split('-').map(Number);
  return Math.round((new Date(ha, hm - 1, hd) - new Date(a, m - 1, d)) / 86400000);
}
function haceDias(n) {
  if (n === null) return '';
  if (n === 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n === -1) return 'mañana';
  return n > 0 ? `hace ${n} días` : `en ${-n} días`;
}
const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const monto = (v) => (v == null ? '<span class="falta">sin monto</span>' : pesos.format(v));

const ETIQUETAS = {
  nuevo: 'Nuevo', caliente: 'Caliente', negociacion: 'Negociación', cerrado: 'Cerrado',
  prospecto: 'Prospecto', propuesta: 'Propuesta',
  baja: 'Baja', media: 'Media', alta: 'Alta',
  pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada',
  llamada: 'Llamada', reunion: 'Reunión', email: 'Email', visita: 'Visita',
  vencida: 'Vencida', hoy: 'Hoy', frenada: 'Frenada',
};
const etiqueta = (v) => `<span class="etiqueta-estado e-${esc(v)}">${esc(ETIQUETAS[v] || v)}</span>`;

// ===========================================================================
// Estado y sesión
// ===========================================================================

const estado = { usuario: null, vista: 'inicio', filtro: '' };
const esAdmin = () => estado.usuario?.rol === 'admin';

let claveRecienUsada = ''; // para completar la contraseña temporal en el cambio obligatorio

function mostrarPantalla(id) {
  for (const p of ['pantalla-login', 'pantalla-cambio', 'pantalla-app']) $(`#${p}`).hidden = p !== id;
}

function mostrarLogin() {
  estado.usuario = null;
  $('#buscar').value = '';
  $('#buscar-resultados').hidden = true;
  $('#insignia-vencidas').hidden = true;
  mostrarPantalla('pantalla-login');
  $('#form-olvide').hidden = true;
  $('#form-login').hidden = false;
  $('#form-login [name=email]').focus();
}

function mostrarCambioObligatorio() {
  mostrarPantalla('pantalla-cambio');
  const form = $('#form-cambio-obligatorio');
  form.reset();
  errorEn(form, '');
  if (claveRecienUsada) form.actual.value = claveRecienUsada;
  (claveRecienUsada ? form.nueva : form.actual).focus();
}

async function entrar(usuario) {
  estado.usuario = usuario;
  if (usuario.debeCambiarPassword) return mostrarCambioObligatorio();
  claveRecienUsada = '';
  mostrarPantalla('pantalla-app');
  $('#usuario-actual').innerHTML = `<strong>${esc(usuario.nombre)}</strong> · ${usuario.rol === 'admin' ? 'administrador' : 'vendedor'}`;
  $('#menu [data-vista=equipo]').hidden = usuario.rol !== 'admin';
  $('#menu [data-vista=usuarios]').hidden = usuario.rol !== 'admin';
  irA('inicio'); // renderVista actualiza la insignia de pedidos
  iniciarChat();
  revisarVencidas(true);
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const datos = Object.fromEntries(new FormData(ev.target));
  const error = $('#login-error');
  error.hidden = true;
  try {
    const usuario = await api('POST', '/api/login', datos);
    claveRecienUsada = datos.password;
    ev.target.reset();
    entrar(usuario);
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
  }
});

// --- Olvidé mi contraseña -----------------------------------------------------

$('#link-olvide').addEventListener('click', () => {
  const form = $('#form-olvide');
  form.reset();
  form.email.value = $('#form-login [name=email]').value;
  $('#olvide-ok').hidden = true;
  $('#olvide-error').hidden = true;
  $('#olvide-enviar').disabled = false;
  $('#form-login').hidden = true;
  form.hidden = false;
  form.email.focus();
});
$('#link-volver').addEventListener('click', mostrarLogin);

$('#form-olvide').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = ev.target.email.value;
  $('#olvide-error').hidden = true;
  try {
    await api('POST', '/api/password/olvide', { email });
    $('#olvide-ok').textContent =
      'Listo. Si el email está registrado, la administración ya recibió tu pedido y te va a pasar una contraseña temporal.';
    $('#olvide-ok').hidden = false;
    $('#olvide-enviar').disabled = true;
  } catch (e) {
    $('#olvide-error').textContent = e.message;
    $('#olvide-error').hidden = false;
  }
});

// --- Cambio de contraseña (obligatorio o voluntario) ---------------------------

async function enviarCambio(form) {
  const { actual, nueva, repetir } = Object.fromEntries(new FormData(form));
  if (nueva !== repetir) throw new Error('Las dos contraseñas nuevas no coinciden.');
  await api('POST', '/api/password/cambiar', { actual, nueva });
}

$('#form-cambio-obligatorio').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await enviarCambio(ev.target);
    claveRecienUsada = '';
    avisar('Contraseña guardada. ¡Bienvenida/o!');
    entrar(await api('GET', '/api/me'));
  } catch (e) {
    errorEn(ev.target, e.message);
  }
});
$('#cambio-salir').addEventListener('click', () => $('#boton-salir').click());

$('#boton-clave').addEventListener('click', () => {
  const form = $('#form-clave');
  form.reset();
  errorEn(form, '');
  $('#dialogo-clave').showModal();
  form.actual.focus();
});

$('#form-clave').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await enviarCambio(ev.target);
    $('#dialogo-clave').close();
    avisar('Contraseña cambiada.');
  } catch (e) {
    errorEn(ev.target, e.message);
  }
});

// Botones "Cancelar"/"Listo" de los diálogos
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-cerrar]');
  if (b) b.closest('dialog')?.close();
});

document.querySelectorAll('.demo-usuarios .chip').forEach((b) =>
  b.addEventListener('click', () => {
    $('#form-login [name=email]').value = b.dataset.email;
    $('#form-login [name=password]').value = 'demo123';
    $('#form-login').requestSubmit();
  })
);

$('#boton-salir').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  $('#chat-mensajes').innerHTML = '';
  mostrarLogin();
});

// ===========================================================================
// Navegación
// ===========================================================================

$('#menu').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-vista]');
  if (b) irA(b.dataset.vista);
});

function irA(vista, clienteId) {
  estado.vista = vista;
  estado.clienteId = clienteId;
  estado.filtro = '';
  const resaltada = vista === 'ficha' ? 'clientes' : vista;
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === resaltada));
  $('#contenido').scrollTop = 0;
  renderVista();
}

async function renderVista() {
  const cont = $('#contenido');
  try {
    if (estado.vista === 'inicio') await renderInicio(cont);
    else if (estado.vista === 'ficha') await renderFicha(cont, estado.clienteId);
    else if (estado.vista === 'embudo') await renderEmbudo(cont);
    else if (estado.vista === 'equipo') await renderEquipo(cont);
    else if (estado.vista === 'usuarios') await renderUsuarios(cont);
    else await renderTabla(cont, estado.vista);
  } catch (e) {
    cont.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
  if (esAdmin()) actualizarInsignia();
  revisarVencidas(false);
}

// ===========================================================================
// Acciones rápidas (funcionan en cualquier vista)
// ===========================================================================

const ETAPAS = ['prospecto', 'propuesta', 'negociacion', 'cerrado'];
const siguienteEtapa = (e) => ETAPAS[ETAPAS.indexOf(e) + 1];
const anteriorEtapa = (e) => ETAPAS[ETAPAS.indexOf(e) - 1];

/** Botón que abre la ficha de un cliente. */
const linkCliente = (id, nombre) =>
  id && nombre ? `<button type="button" class="link" data-accion="ficha" data-id="${id}">${esc(nombre)}</button>` : '<span class="falta">—</span>';

/** Casilla para completar (o reabrir) una tarea. */
const casillaTarea = (t) =>
  `<button type="button" class="casilla ${t.estado === 'completada' ? 'marcada' : ''}" data-accion="completar" data-id="${t.id}" data-estado="${t.estado}" title="${t.estado === 'completada' ? 'Marcar como pendiente' : 'Marcar como completada'}" aria-label="${t.estado === 'completada' ? 'Marcar como pendiente' : 'Marcar como completada'}"></button>`;

/** Botones para mover una oportunidad de etapa. */
const botonesEtapa = (o) => {
  const ant = anteriorEtapa(o.etapa);
  const sig = siguienteEtapa(o.etapa);
  return `<span class="mover">${ant ? `<button type="button" class="boton chico fantasma" data-accion="etapa" data-id="${o.id}" data-etapa="${ant}" title="Volver a ${ETIQUETAS[ant]}">←</button>` : ''}${sig ? `<button type="button" class="boton chico" data-accion="etapa" data-id="${o.id}" data-etapa="${sig}" title="Pasar a ${ETIQUETAS[sig]}">${ETIQUETAS[sig]} →</button>` : ''}</span>`;
};

async function moverEtapa(id, etapa) {
  await api('PUT', `/api/oportunidades/${id}`, { etapa });
  avisar(`Oportunidad movida a ${ETIQUETAS[etapa]}.`);
}

$('#contenido').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-accion]');
  if (!b) return;
  ev.stopPropagation();
  const id = Number(b.dataset.id);
  try {
    switch (b.dataset.accion) {
      case 'ficha':
        return irA('ficha', id);
      case 'completar': {
        const completada = b.dataset.estado !== 'completada';
        await api('PUT', `/api/tareas/${id}`, { estado: completada ? 'completada' : 'pendiente' });
        avisar(completada ? 'Tarea completada.' : 'Tarea marcada como pendiente.');
        return renderVista();
      }
      case 'etapa':
        await moverEtapa(id, b.dataset.etapa);
        return renderVista();
      case 'nuevo': {
        const pre = {};
        if (b.dataset.cliente) pre.cliente_id = Number(b.dataset.cliente);
        if (b.dataset.tipo) pre.tipo = b.dataset.tipo;
        return abrirFormulario(b.dataset.entidad, null, pre);
      }
      case 'editar': {
        const registro = await api('GET', `/api/${b.dataset.entidad}`).then((l) => l.find((x) => x.id === id));
        return abrirFormulario(b.dataset.entidad, registro);
      }
      case 'preguntar':
        $('#chat').classList.add('abierto');
        return enviar(b.dataset.pregunta);
    }
  } catch (e) {
    avisar(e.message);
  }
});

// ===========================================================================
// Inicio: resumen del día con las reglas del negocio
// ===========================================================================

async function renderInicio(cont) {
  const [r, opos, actividades] = await Promise.all([
    api('GET', '/api/resumen'),
    api('GET', '/api/oportunidades'),
    api('GET', '/api/actividades'),
  ]);
  const quien = (nombre) => (esAdmin() && nombre ? ` · ${esc(nombre)}` : '');
  const lista = (items, fila, vacio) =>
    items.length ? `<ul>${items.map(fila).join('')}</ul>` : `<p class="vacio">${vacio}</p>`;

  const [a, m, d] = r.fecha.split('-');
  const fechaHoy = new Date(a, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  cont.innerHTML = `
    <div class="vista-cabecera">
      <h1>Hola, ${esc(estado.usuario.nombre.split(' ')[0])}</h1>
      <div class="herramientas">
        <span class="sutil">${esc(fechaHoy)}</span>
        <a class="boton chico" href="/api/exportar/todo" download title="Un archivo con una hoja por cada sección">Descargar todo en Excel</a>
      </div>
    </div>
    <div class="tarjetas">
      <div class="tarjeta ${r.tareasVencidas.length ? 'peligro' : ''}"><div class="valor">${r.tareasVencidas.length}</div><div class="etiqueta">Tareas vencidas</div></div>
      <div class="tarjeta ${r.tareasHoy.length ? 'alerta' : ''}"><div class="valor">${r.tareasHoy.length}</div><div class="etiqueta">Tareas para hoy</div></div>
      <div class="tarjeta ${r.clientesSinActividad.length ? 'alerta' : ''}"><div class="valor">${r.clientesSinActividad.length}</div><div class="etiqueta">Clientes sin seguimiento</div></div>
      <div class="tarjeta ${r.oportunidadesFrenadas.length ? 'alerta' : ''}"><div class="valor">${r.oportunidadesFrenadas.length}</div><div class="etiqueta">Oportunidades frenadas</div></div>
      <div class="tarjeta"><div class="valor">${pesos.format(r.totales.montoAbierto)}</div><div class="etiqueta">En ${r.totales.oportunidadesAbiertas} oportunidades abiertas${r.totales.oportunidadesSinMonto ? ` (${r.totales.oportunidadesSinMonto} sin monto)` : ''}</div></div>
    </div>
    <div class="paneles">
      <section class="panel">
        <h2>Tareas vencidas <span class="cuenta">${r.tareasVencidas.length}</span></h2>
        ${lista(r.tareasVencidas, (t) => `<li>${casillaTarea(t)}<span class="crece"><strong>${esc(t.titulo)}</strong>${t.cliente ? ` · ${linkCliente(t.cliente_id, t.cliente)}` : ''}${quien(t.asignado)}</span><span class="detalle">${t.dias_de_atraso} ${t.dias_de_atraso === 1 ? 'día' : 'días'} de atraso · ${etiqueta(t.prioridad)}</span></li>`, 'No hay tareas vencidas. ¡Bien!')}
      </section>
      <section class="panel">
        <h2>Para hoy y los próximos 2 días <span class="cuenta">${r.tareasHoy.length + r.tareasProximas.length}</span></h2>
        ${lista([...r.tareasHoy, ...r.tareasProximas], (t) => `<li>${casillaTarea(t)}<span class="crece"><strong>${esc(t.titulo)}</strong>${t.cliente ? ` · ${linkCliente(t.cliente_id, t.cliente)}` : ''}${quien(t.asignado)}</span><span class="detalle">${t.dias_para_vencer === 0 ? 'vence hoy' : `vence ${haceDias(-t.dias_para_vencer)}`} · ${etiqueta(t.prioridad)}</span></li>`, 'Nada programado para estos días.')}
      </section>
      <section class="panel">
        <h2>Clientes sin seguimiento <span class="cuenta">${r.clientesSinActividad.length}</span></h2>
        ${lista(r.clientesSinActividad, (c) => `<li><span class="crece"><strong>${linkCliente(c.id, c.nombre)}</strong> ${etiqueta(c.estado)}${quien(c.responsable)}</span><span class="detalle">${c.dias_sin_actividad === null ? 'sin actividad registrada' : `última actividad ${haceDias(c.dias_sin_actividad)}`}</span></li>`, 'Todos los clientes calientes o en negociación tienen seguimiento reciente.')}
        <p class="nota-regla">Clientes "caliente" o "negociación" sin actividad hace más de 3 días.</p>
      </section>
      <section class="panel">
        <h2>Oportunidades frenadas <span class="cuenta">${r.oportunidadesFrenadas.length}</span></h2>
        ${lista(r.oportunidadesFrenadas, (o) => `<li><span class="crece"><strong>${esc(o.titulo)}</strong> · ${linkCliente(o.cliente_id, o.cliente)}${quien(o.responsable)}</span><span class="detalle">${o.dias_sin_cambio_de_etapa} días en ${etiqueta(o.etapa)} · ${monto(o.monto)}</span></li>`, 'No hay oportunidades frenadas.')}
        <p class="nota-regla">Oportunidades abiertas sin cambio de etapa hace más de 14 días.</p>
      </section>
    </div>
    ${seccionGraficos(opos, actividades)}`;
}

// ===========================================================================
// Tablas del CRM
// ===========================================================================

const ENTIDADES = {
  clientes: {
    titulo: 'Clientes', singular: 'cliente',
    columnas: [
      { t: 'Nombre', v: (x) => `<strong>${esc(x.nombre)}</strong>${x.empresa ? `<div class="sutil">${esc(x.empresa)}</div>` : ''}` },
      { t: 'Estado', v: (x) => etiqueta(x.estado) },
      { t: 'Contacto', v: (x) => [x.email, x.telefono].filter(Boolean).map(esc).join('<br>') || '<span class="falta">sin datos</span>' },
      { t: 'Última actividad', v: (x) => (x.ultima_actividad ? `${fecha(x.ultima_actividad)}<div class="sutil">${haceDias(diasDesde(x.ultima_actividad))}</div>` : '<span class="falta">sin actividad</span>') },
      { t: 'Responsable', v: (x) => esc(x.responsable), admin: true },
      { t: 'Notas', v: (x) => esc(x.notas) },
    ],
    campos: [
      { n: 'nombre', t: 'Nombre', req: true },
      { n: 'empresa', t: 'Empresa (razón social)' },
      { n: 'email', t: 'Email', tipo: 'email' },
      { n: 'telefono', t: 'Teléfono', tipo: 'tel' },
      { n: 'estado', t: 'Estado', opciones: ['nuevo', 'caliente', 'negociacion', 'cerrado'], def: 'nuevo' },
      { n: 'responsable_id', t: 'Responsable', tipo: 'usuario' },
      { n: 'notas', t: 'Notas', tipo: 'area' },
    ],
  },
  oportunidades: {
    titulo: 'Oportunidades', singular: 'oportunidad',
    columnas: [
      { t: 'Título', v: (x) => `<strong>${esc(x.titulo)}</strong>` },
      { t: 'Cliente', v: (x) => linkCliente(x.cliente_id, x.cliente) },
      { t: 'Monto', v: (x) => monto(x.monto), c: 'num' },
      { t: 'Etapa', v: (x) => etiqueta(x.etapa) },
      { t: 'Prob.', v: (x) => (x.probabilidad == null ? '<span class="falta">—</span>' : `${x.probabilidad} %`), c: 'num' },
      { t: 'Cierre estimado', v: (x) => fecha(x.fecha_cierre) },
      { t: 'Último cambio de etapa', v: (x) => `${fecha(x.fecha_cambio_etapa)}<div class="sutil">${haceDias(diasDesde(x.fecha_cambio_etapa))}</div>` },
      { t: 'Responsable', v: (x) => esc(x.responsable), admin: true },
      { t: '', v: (x) => botonesEtapa(x), c: 'acciones' },
    ],
    campos: [
      { n: 'titulo', t: 'Título', req: true, ancho: true },
      { n: 'cliente_id', t: 'Cliente', tipo: 'cliente', req: true },
      { n: 'monto', t: 'Monto ($)', tipo: 'number' },
      { n: 'etapa', t: 'Etapa', opciones: ['prospecto', 'propuesta', 'negociacion', 'cerrado'], def: 'prospecto' },
      { n: 'probabilidad', t: 'Probabilidad (%)', tipo: 'number', min: 0, max: 100 },
      { n: 'fecha_cierre', t: 'Fecha estimada de cierre', tipo: 'date' },
      { n: 'responsable_id', t: 'Responsable', tipo: 'usuario' },
    ],
    info: 'La fecha de cambio de etapa se actualiza sola cuando cambiás la etapa.',
  },
  tareas: {
    titulo: 'Tareas', singular: 'tarea',
    columnas: [
      { t: '', v: (x) => casillaTarea(x), c: 'col-casilla' },
      { t: 'Tarea', v: (x) => `<strong>${esc(x.titulo)}</strong>${x.descripcion ? `<div class="sutil">${esc(x.descripcion)}</div>` : ''}` },
      { t: 'Cliente', v: (x) => linkCliente(x.cliente_id, x.cliente) },
      {
        t: 'Fecha límite',
        v: (x) => {
          const d = diasDesde(x.fecha_limite);
          const marca = x.estado === 'completada' || d === null ? '' : d > 0 ? ` ${etiqueta('vencida')}` : d === 0 ? ` ${etiqueta('hoy')}` : '';
          return fecha(x.fecha_limite) + marca;
        },
      },
      { t: 'Prioridad', v: (x) => etiqueta(x.prioridad) },
      { t: 'Estado', v: (x) => etiqueta(x.estado) },
      { t: 'Asignada a', v: (x) => esc(x.asignado), admin: true },
    ],
    campos: [
      { n: 'titulo', t: 'Título', req: true, ancho: true },
      { n: 'cliente_id', t: 'Cliente', tipo: 'cliente' },
      { n: 'fecha_limite', t: 'Fecha límite', tipo: 'date', def: hoyISO },
      { n: 'prioridad', t: 'Prioridad', opciones: ['baja', 'media', 'alta'], def: 'media' },
      { n: 'estado', t: 'Estado', opciones: ['pendiente', 'en_progreso', 'completada'], def: 'pendiente' },
      { n: 'asignado_id', t: 'Asignada a', tipo: 'usuario' },
      { n: 'descripcion', t: 'Descripción', tipo: 'area' },
    ],
  },
  actividades: {
    titulo: 'Actividades', singular: 'actividad',
    columnas: [
      { t: 'Fecha', v: (x) => `${fecha(x.fecha)}<div class="sutil">${haceDias(diasDesde(x.fecha))}</div>` },
      { t: 'Tipo', v: (x) => etiqueta(x.tipo) },
      { t: 'Actividad', v: (x) => `<strong>${esc(x.titulo)}</strong>${x.descripcion ? `<div class="sutil">${esc(x.descripcion)}</div>` : ''}` },
      { t: 'Cliente', v: (x) => linkCliente(x.cliente_id, x.cliente) },
      { t: 'Responsable', v: (x) => esc(x.responsable), admin: true },
    ],
    campos: [
      { n: 'titulo', t: 'Título', req: true, ancho: true },
      { n: 'cliente_id', t: 'Cliente', tipo: 'cliente', req: true },
      { n: 'tipo', t: 'Tipo', opciones: ['llamada', 'reunion', 'email', 'visita'], def: 'llamada' },
      { n: 'fecha', t: 'Fecha', tipo: 'date', req: true, def: hoyISO },
      { n: 'responsable_id', t: 'Responsable', tipo: 'usuario' },
      { n: 'descripcion', t: 'Descripción', tipo: 'area' },
    ],
  },
  contactos: {
    titulo: 'Contactos', singular: 'contacto',
    columnas: [
      { t: 'Nombre', v: (x) => `<strong>${esc(x.nombre)}</strong>` },
      { t: 'Cliente', v: (x) => linkCliente(x.cliente_id, x.cliente) },
      { t: 'Cargo', v: (x) => esc(x.cargo) },
      { t: 'Email', v: (x) => esc(x.email) },
      { t: 'Teléfono', v: (x) => esc(x.telefono) },
    ],
    campos: [
      { n: 'nombre', t: 'Nombre', req: true },
      { n: 'cliente_id', t: 'Cliente', tipo: 'cliente', req: true },
      { n: 'cargo', t: 'Cargo' },
      { n: 'email', t: 'Email', tipo: 'email' },
      { n: 'telefono', t: 'Teléfono', tipo: 'tel' },
      { n: 'notas', t: 'Notas', tipo: 'area' },
    ],
  },
};

let filasActuales = [];

async function renderTabla(cont, nombre) {
  const def = ENTIDADES[nombre];
  filasActuales = await api('GET', `/api/${nombre}`);
  const columnas = def.columnas.filter((c) => !c.admin || esAdmin());

  cont.innerHTML = `
    <div class="vista-cabecera">
      <h1>${def.titulo} <span class="sutil">${filasActuales.length}</span></h1>
      <div class="herramientas">
        <input type="search" id="filtro" placeholder="Buscar…" value="${esc(estado.filtro)}">
        <a class="boton" href="/api/exportar/${nombre}" download>Exportar a Excel</a>
        <button class="boton primario" id="boton-nuevo">Nuevo</button>
      </div>
    </div>
    <div class="tabla-envoltura">
      <table class="tabla">
        <thead><tr>${columnas.map((c) => `<th class="${c.c || ''}">${c.t}</th>`).join('')}</tr></thead>
        <tbody></tbody>
      </table>
    </div>`;

  const cuerpo = $('tbody', cont);
  const pintar = () => {
    const q = estado.filtro.toLowerCase();
    const visibles = q
      ? filasActuales.filter((f) => Object.values(f).some((v) => String(v ?? '').toLowerCase().includes(q)))
      : filasActuales;
    cuerpo.innerHTML = visibles.length
      ? visibles.map((f) => `<tr data-id="${f.id}" class="${f.estado === 'completada' ? 'hecha' : ''}">${columnas.map((c) => `<td class="${c.c || ''}">${c.v(f)}</td>`).join('')}</tr>`).join('')
      : `<tr><td class="vacio" colspan="${columnas.length}">${q ? 'No hay resultados para la búsqueda.' : `Todavía no hay ${def.titulo.toLowerCase()} cargados.`}</td></tr>`;
  };
  pintar();

  $('#filtro').addEventListener('input', (ev) => { estado.filtro = ev.target.value; pintar(); });
  $('#boton-nuevo').addEventListener('click', () => abrirFormulario(nombre));
  cuerpo.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-accion]')) return;
    const tr = ev.target.closest('tr[data-id]');
    if (!tr) return;
    if (nombre === 'clientes') irA('ficha', Number(tr.dataset.id));
    else abrirFormulario(nombre, filasActuales.find((f) => f.id === Number(tr.dataset.id)));
  });
}

// ===========================================================================
// Formulario de alta y edición
// ===========================================================================

const dialogo = $('#dialogo');
let edicion = null;

async function abrirFormulario(nombre, registro, predefinidos = {}) {
  const def = ENTIDADES[nombre];
  edicion = { nombre, id: registro?.id };
  const necesitaClientes = def.campos.some((c) => c.tipo === 'cliente');
  const [clientes, usuarios] = await Promise.all([
    necesitaClientes ? api('GET', '/api/clientes') : [],
    esAdmin() ? api('GET', '/api/usuarios') : [],
  ]);

  const valorInicial = (c) => {
    if (registro) return registro[c.n] ?? '';
    if (predefinidos[c.n] != null) return predefinidos[c.n];
    if (c.tipo === 'usuario') return estado.usuario.id;
    return typeof c.def === 'function' ? c.def() : c.def ?? '';
  };

  const campoHtml = (c) => {
    const v = valorInicial(c);
    const req = c.req ? 'required' : '';
    let control;
    if (c.opciones) {
      control = `<select name="${c.n}">${c.opciones.map((o) => `<option value="${o}" ${o === v ? 'selected' : ''}>${ETIQUETAS[o] || o}</option>`).join('')}</select>`;
    } else if (c.tipo === 'cliente') {
      control = `<select name="${c.n}" ${req}><option value="">${c.req ? 'Elegí un cliente…' : 'Sin cliente'}</option>${clientes.map((x) => `<option value="${x.id}" ${x.id === v ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>`;
    } else if (c.tipo === 'usuario') {
      if (!esAdmin()) return ''; // el vendedor siempre es el responsable
      control = `<select name="${c.n}">${usuarios.map((u) => `<option value="${u.id}" ${u.id === v ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select>`;
    } else if (c.tipo === 'area') {
      control = `<textarea name="${c.n}" rows="3">${esc(v)}</textarea>`;
    } else {
      const extra = [c.min != null ? `min="${c.min}"` : '', c.max != null ? `max="${c.max}"` : '', c.tipo === 'number' ? 'step="any"' : ''].join(' ');
      control = `<input name="${c.n}" type="${c.tipo || 'text'}" value="${esc(v)}" ${req} ${extra}>`;
    }
    return `<label class="${c.ancho || c.tipo === 'area' ? 'ancho' : ''}">${c.t}${c.req ? ' *' : ''} ${control}</label>`;
  };

  $('#dialogo-titulo').textContent = registro ? `Editar ${def.singular}` : `Nuevo ${def.singular}`.replace('Nuevo oportunidad', 'Nueva oportunidad').replace('Nuevo tarea', 'Nueva tarea').replace('Nuevo actividad', 'Nueva actividad');
  $('#dialogo-campos').innerHTML = def.campos.map(campoHtml).join('') + (def.info ? `<p class="info">${def.info}</p>` : '');
  $('#dialogo-error').hidden = true;
  $('#boton-eliminar').hidden = !registro;
  if (necesitaClientes && !clientes.length) {
    $('#dialogo-error').textContent = 'Primero tenés que cargar al menos un cliente.';
    $('#dialogo-error').hidden = false;
  }
  dialogo.showModal();
  $('#dialogo-campos input, #dialogo-campos select')?.focus();
}

$('#form-registro').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const datos = Object.fromEntries(new FormData(ev.target));
  try {
    if (edicion.id) await api('PUT', `/api/${edicion.nombre}/${edicion.id}`, datos);
    else await api('POST', `/api/${edicion.nombre}`, datos);
    dialogo.close();
    avisar('Guardado.');
    renderVista();
  } catch (e) {
    $('#dialogo-error').textContent = e.message;
    $('#dialogo-error').hidden = false;
  }
});

$('#boton-cancelar').addEventListener('click', () => dialogo.close());

$('#boton-eliminar').addEventListener('click', async () => {
  const def = ENTIDADES[edicion.nombre];
  const aviso = edicion.nombre === 'clientes' ? ' También se borran sus contactos, oportunidades, tareas y actividades.' : '';
  if (!confirm(`¿Eliminar este registro de ${def.titulo.toLowerCase()}?${aviso}`)) return;
  try {
    await api('DELETE', `/api/${edicion.nombre}/${edicion.id}`);
    dialogo.close();
    avisar('Eliminado.');
    if (edicion.nombre === 'clientes' && estado.vista === 'ficha') irA('clientes');
    else renderVista();
  } catch (e) {
    $('#dialogo-error').textContent = e.message;
    $('#dialogo-error').hidden = false;
  }
});

// ===========================================================================
// Ficha de cliente
// ===========================================================================

async function renderFicha(cont, id) {
  const f = await api('GET', `/api/clientes/${id}/ficha`);
  const c = f.cliente;
  const pendientes = f.tareas.filter((t) => t.estado !== 'completada');
  const hechas = f.tareas.filter((t) => t.estado === 'completada');
  const abiertas = f.oportunidades.filter((o) => o.etapa !== 'cerrado');
  const dato = (titulo, valor) => `<div><dt>${titulo}</dt><dd>${valor || '<span class="falta">sin dato</span>'}</dd></div>`;
  const nuevo = (entidad, texto, extra = '') =>
    `<button type="button" class="boton chico" data-accion="nuevo" data-entidad="${entidad}" data-cliente="${c.id}" ${extra}>${texto}</button>`;

  const filaTarea = (t) => {
    const d = t.dias_de_atraso ? `<span class="detalle">${etiqueta('vencida')} hace ${t.dias_de_atraso} ${t.dias_de_atraso === 1 ? 'día' : 'días'}</span>`
      : t.dias_para_vencer === 0 ? `<span class="detalle">${etiqueta('hoy')}</span>`
      : `<span class="detalle">${fecha(t.fecha_limite)}</span>`;
    return `<li class="${t.estado === 'completada' ? 'hecha' : ''}">${casillaTarea(t)}<button type="button" class="link crece" data-accion="editar" data-entidad="tareas" data-id="${t.id}">${esc(t.titulo)}</button>${t.estado === 'completada' ? '' : d} ${etiqueta(t.prioridad)}</li>`;
  };

  const ICONOS = { llamada: '📞', reunion: '🤝', email: '✉️', visita: '🚗' };

  cont.innerHTML = `
    <div class="migas"><button type="button" class="link" onclick="irA('clientes')">← Clientes</button></div>
    <div class="vista-cabecera">
      <h1>${esc(c.nombre)} ${etiqueta(c.estado)}</h1>
      <div class="herramientas">
        <button type="button" class="boton" data-accion="preguntar" data-pregunta="¿Qué hago con ${esc(c.nombre)}?">Preguntar al asistente</button>
        <button type="button" class="boton" data-accion="editar" data-entidad="clientes" data-id="${c.id}">Editar</button>
      </div>
    </div>

    ${f.proximoPaso ? `
    <section class="proximo-paso">
      <div class="pp-etiqueta">Próximo paso sugerido</div>
      <div class="pp-accion">${esc(f.proximoPaso.accion)}</div>
      <div class="pp-detalle"><strong>${esc(f.proximoPaso.plazo)}</strong> · ${esc(f.proximoPaso.motivo)}</div>
      <p class="nota-regla">Sugerencia según el estado del cliente (reglas del negocio). La decisión es tuya.</p>
    </section>` : ''}

    <div class="ficha">
      <div class="ficha-col">
        <section class="panel">
          <h2>Datos</h2>
          <dl class="datos">
            ${dato('Empresa', esc(c.empresa))}
            ${dato('Email', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '')}
            ${dato('Teléfono', esc(c.telefono))}
            ${dato('Responsable', esc(c.responsable))}
            ${dato('Última actividad', c.ultima_actividad ? `${fecha(c.ultima_actividad)} (${haceDias(c.dias_sin_actividad)})` : '')}
            ${c.notas ? dato('Notas', esc(c.notas)) : ''}
          </dl>
        </section>

        <section class="panel">
          <h2>Contactos <span class="cuenta">${f.contactos.length}</span><span class="espacio"></span>${nuevo('contactos', '+ Contacto')}</h2>
          ${f.contactos.length ? `<ul>${f.contactos.map((p) => `<li><span class="crece"><button type="button" class="link" data-accion="editar" data-entidad="contactos" data-id="${p.id}"><strong>${esc(p.nombre)}</strong></button>${p.cargo ? ` · ${esc(p.cargo)}` : ''}</span><span class="detalle">${[p.email, p.telefono].filter(Boolean).map(esc).join(' · ')}</span></li>`).join('')}</ul>` : '<p class="vacio">No hay contactos cargados.</p>'}
        </section>

        <section class="panel">
          <h2>Oportunidades <span class="cuenta">${abiertas.length} abiertas</span><span class="espacio"></span>${nuevo('oportunidades', '+ Oportunidad')}</h2>
          ${f.oportunidades.length ? `<ul>${f.oportunidades.map((o) => `
            <li class="opo">
              <div class="crece">
                <button type="button" class="link" data-accion="editar" data-entidad="oportunidades" data-id="${o.id}"><strong>${esc(o.titulo)}</strong></button>
                <div class="detalle">${monto(o.monto)} · ${etiqueta(o.etapa)}${o.probabilidad != null ? ` · ${o.probabilidad} %` : ''}${o.etapa !== 'cerrado' && o.dias_sin_cambio_de_etapa > 14 ? ` · <span class="etiqueta-estado e-vencida">Frenada: ${o.dias_sin_cambio_de_etapa} días</span>` : ''}</div>
              </div>
              ${botonesEtapa(o)}
            </li>`).join('')}</ul>` : '<p class="vacio">No hay oportunidades.</p>'}
        </section>
      </div>

      <div class="ficha-col">
        <section class="panel">
          <h2>Tareas <span class="cuenta">${pendientes.length} pendientes</span><span class="espacio"></span>${nuevo('tareas', '+ Tarea')}</h2>
          ${pendientes.length ? `<ul>${pendientes.map(filaTarea).join('')}</ul>` : '<p class="vacio">No hay tareas pendientes.</p>'}
          ${hechas.length ? `<details class="hechas"><summary>${hechas.length} completada${hechas.length === 1 ? '' : 's'}</summary><ul>${hechas.map(filaTarea).join('')}</ul></details>` : ''}
        </section>

        <section class="panel">
          <h2>Historial <span class="cuenta">${f.actividades.length}</span></h2>
          <div class="registrar">
            <span class="sutil">Registrar:</span>
            ${['llamada', 'reunion', 'email', 'visita'].map((t) => nuevo('actividades', `${ICONOS[t]} ${ETIQUETAS[t]}`, `data-tipo="${t}"`)).join('')}
          </div>
          ${f.actividades.length ? `<ol class="linea-tiempo">${f.actividades.map((a) => `
            <li>
              <span class="lt-icono" aria-hidden="true">${ICONOS[a.tipo] || '•'}</span>
              <div>
                <button type="button" class="link" data-accion="editar" data-entidad="actividades" data-id="${a.id}"><strong>${esc(a.titulo)}</strong></button>
                <div class="detalle">${ETIQUETAS[a.tipo]} · ${fecha(a.fecha)} (${haceDias(diasDesde(a.fecha))})${esAdmin() ? ` · ${esc(a.responsable)}` : ''}</div>
                ${a.descripcion ? `<div>${esc(a.descripcion)}</div>` : ''}
              </div>
            </li>`).join('')}</ol>` : '<p class="vacio">Todavía no hay actividades registradas.</p>'}
        </section>
      </div>
    </div>`;
}

// ===========================================================================
// Embudo de ventas
// ===========================================================================

async function renderEmbudo(cont) {
  const opos = await api('GET', '/api/oportunidades');
  const total = (lista) => lista.reduce((s, o) => s + (o.monto || 0), 0);
  const ponderado = opos.filter((o) => o.etapa !== 'cerrado').reduce((s, o) => s + (o.monto || 0) * ((o.probabilidad ?? 0) / 100), 0);

  cont.innerHTML = `
    <div class="vista-cabecera">
      <h1>Embudo de ventas</h1>
      <div class="herramientas">
        <span class="sutil">Pronóstico ponderado: <strong>${pesos.format(ponderado)}</strong></span>
        <button type="button" class="boton primario" data-accion="nuevo" data-entidad="oportunidades">Nueva</button>
      </div>
    </div>
    <p class="sutil ayuda">Arrastrá una tarjeta a otra columna o usá las flechas para cambiar la etapa.</p>
    <div class="embudo">
      ${ETAPAS.map((etapa) => {
        const lista = opos.filter((o) => o.etapa === etapa);
        const sinMonto = lista.filter((o) => o.monto == null).length;
        return `
        <section class="columna" data-etapa="${etapa}">
          <header>
            <div>${etiqueta(etapa)} <span class="cuenta">${lista.length}</span></div>
            <div class="col-total">${pesos.format(total(lista))}${sinMonto ? ` <span class="sutil">(+${sinMonto} sin monto)</span>` : ''}</div>
          </header>
          <div class="tarjetas-col">
            ${lista.map((o) => {
              const frenada = etapa !== 'cerrado' && o.dias_sin_cambio_de_etapa > 14;
              const dias = diasDesde(o.fecha_cambio_etapa);
              return `
              <article class="opo-tarjeta ${frenada ? 'frenada' : ''}" draggable="true" data-id="${o.id}">
                <button type="button" class="link" data-accion="editar" data-entidad="oportunidades" data-id="${o.id}"><strong>${esc(o.titulo)}</strong></button>
                <div>${linkCliente(o.cliente_id, o.cliente)}${esAdmin() ? ` · <span class="sutil">${esc(o.responsable)}</span>` : ''}</div>
                <div class="opo-monto">${monto(o.monto)}${o.probabilidad != null ? ` <span class="sutil">· ${o.probabilidad} %</span>` : ''}</div>
                <div class="sutil">${dias === 0 ? 'En esta etapa desde hoy' : `${dias} ${dias === 1 ? 'día' : 'días'} en esta etapa`}${frenada ? ' · <span class="etiqueta-estado e-vencida">Frenada</span>' : ''}</div>
                ${botonesEtapa(o)}
              </article>`;
            }).join('') || '<p class="vacio">Sin oportunidades</p>'}
          </div>
        </section>`;
      }).join('')}
    </div>`;

  // Arrastrar y soltar entre columnas
  cont.querySelectorAll('.opo-tarjeta').forEach((t) =>
    t.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', t.dataset.id);
      t.classList.add('arrastrando');
    })
  );
  cont.querySelectorAll('.opo-tarjeta').forEach((t) => t.addEventListener('dragend', () => t.classList.remove('arrastrando')));
  cont.querySelectorAll('.columna').forEach((col) => {
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('destino'); });
    col.addEventListener('dragleave', () => col.classList.remove('destino'));
    col.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      col.classList.remove('destino');
      const id = Number(ev.dataTransfer.getData('text/plain'));
      const opo = opos.find((o) => o.id === id);
      if (!opo || opo.etapa === col.dataset.etapa) return;
      try {
        await moverEtapa(id, col.dataset.etapa);
      } catch (e) {
        avisar(e.message);
      }
      renderVista();
    });
  });
}

// ===========================================================================
// Estado del equipo (administrador)
// ===========================================================================

async function renderEquipo(cont) {
  const equipo = await api('GET', '/api/equipo');
  const alerta = (n, clase = 'peligro') => `<span class="${n ? `num-${clase}` : ''}">${n}</span>`;

  cont.innerHTML = `
    <div class="vista-cabecera"><h1>Estado del equipo</h1></div>
    <div class="tabla-envoltura">
      <table class="tabla sin-clic">
        <thead><tr>
          <th>Vendedor</th><th class="num">Clientes</th><th class="num">Tareas pendientes</th><th class="num">Tareas vencidas</th>
          <th class="num">Sin seguimiento</th><th class="num">Oport. abiertas</th><th class="num">Monto abierto</th><th class="num">Frenadas</th>
        </tr></thead>
        <tbody>${equipo.map((v) => `
          <tr>
            <td><strong>${esc(v.nombre)}</strong></td>
            <td class="num">${v.clientes}</td>
            <td class="num">${v.tareasPendientes}</td>
            <td class="num">${alerta(v.tareasVencidas.length)}</td>
            <td class="num">${alerta(v.clientesSinActividad.length, 'alerta')}</td>
            <td class="num">${v.oportunidadesAbiertas}</td>
            <td class="num">${pesos.format(v.montoAbierto)}${v.oportunidadesSinMonto ? `<div class="sutil">${v.oportunidadesSinMonto} sin monto</div>` : ''}</td>
            <td class="num">${alerta(v.oportunidadesFrenadas.length, 'alerta')}</td>
          </tr>`).join('') || '<tr><td class="vacio" colspan="8">No hay vendedores cargados.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h2 class="subtitulo">Alertas por vendedor</h2>
    <div class="paneles">
      ${equipo.map((v) => {
        const items = [
          ...v.tareasVencidas.map((t) => `<li><span class="crece">${etiqueta('vencida')} <strong>${esc(t.titulo)}</strong>${t.cliente ? ` · ${linkCliente(t.cliente_id, t.cliente)}` : ''}</span><span class="detalle">${t.dias_de_atraso} ${t.dias_de_atraso === 1 ? 'día' : 'días'} de atraso</span></li>`),
          ...v.oportunidadesFrenadas.map((o) => `<li><span class="crece">${etiqueta('frenada')} <strong>${esc(o.titulo)}</strong> · ${linkCliente(o.cliente_id, o.cliente)}</span><span class="detalle">${o.dias_sin_cambio_de_etapa} días sin cambio</span></li>`),
          ...v.clientesSinActividad.map((c) => `<li><span class="crece">${etiqueta(c.estado)} ${linkCliente(c.id, c.nombre)}</span><span class="detalle">${c.dias_sin_actividad === null ? 'sin actividad' : `${c.dias_sin_actividad} días sin actividad`}</span></li>`),
        ];
        return `
        <section class="panel">
          <h2>${esc(v.nombre)} <span class="cuenta">${items.length} ${items.length === 1 ? 'alerta' : 'alertas'}</span></h2>
          ${items.length ? `<ul>${items.join('')}</ul>` : '<p class="vacio">Sin alertas. ¡Todo al día!</p>'}
        </section>`;
      }).join('')}
    </div>`;
}

// ===========================================================================
// Usuarios (administración)
// ===========================================================================

/** Insignia en el menú y aviso en Inicio cuando hay pedidos de contraseña pendientes. */
let consultaInsignia = 0;
async function actualizarInsignia() {
  if (!esAdmin()) return;
  const esta = ++consultaInsignia;
  let pendientes = [];
  try {
    pendientes = await api('GET', '/api/admin/solicitudes');
  } catch {
    return;
  }
  if (esta !== consultaInsignia) return; // llegó una consulta más nueva
  const insignia = $('#insignia-solicitudes');
  insignia.textContent = pendientes.length;
  insignia.hidden = !pendientes.length;

  $('#aviso-solicitudes')?.remove();
  if (pendientes.length && estado.vista === 'inicio') {
    const aviso = document.createElement('div');
    aviso.id = 'aviso-solicitudes';
    aviso.className = 'banda-aviso';
    aviso.innerHTML = `<span><strong>${pendientes.length === 1 ? '1 persona pidió' : `${pendientes.length} personas pidieron`} restablecer su contraseña:</strong> ${pendientes.map((p) => esc(p.nombre)).join(', ')}.</span>
      <button type="button" class="boton chico primario" data-usr="ir-usuarios">Resolver</button>`;
    $('#contenido').prepend(aviso);
  }
}

function mostrarTemporal(resultado, esNuevo) {
  const { usuario, passwordTemporal } = resultado;
  const link = location.origin;
  $('#temporal-para').innerHTML = esNuevo
    ? `Se creó la cuenta de <strong>${esc(usuario.nombre)}</strong> (${esc(usuario.email)}).`
    : `Nueva contraseña temporal para <strong>${esc(usuario.nombre)}</strong> (${esc(usuario.email)}).`;
  $('#temporal-clave').textContent = passwordTemporal;
  $('#temporal-mensaje').value = esNuevo
    ? `Hola ${usuario.nombre.split(' ')[0]}, ya tenés tu cuenta en la Agenda Inteligente.\nEntrá a ${link}\nEmail: ${usuario.email}\nContraseña temporal: ${passwordTemporal}\nAl ingresar te va a pedir que elijas una contraseña propia.`
    : `Hola ${usuario.nombre.split(' ')[0]}, te restablecí la contraseña de la Agenda Inteligente.\nEntrá a ${link}\nEmail: ${usuario.email}\nContraseña temporal: ${passwordTemporal}\nAl ingresar te va a pedir que elijas una contraseña nueva.`;
  $('#dialogo-temporal').showModal();
}
// Al cerrar, la contraseña temporal no queda guardada en la página.
$('#dialogo-temporal').addEventListener('close', () => {
  $('#temporal-para').textContent = '';
  $('#temporal-clave').textContent = '';
  $('#temporal-mensaje').value = '';
});
$('#temporal-copiar').addEventListener('click', () => copiar($('#temporal-clave').textContent));
$('#temporal-copiar-mensaje').addEventListener('click', () => copiar($('#temporal-mensaje').value));

const esDemo = (email) => /@demo\.com$/i.test(email);

async function renderUsuarios(cont) {
  const [usuarios, solicitudes] = await Promise.all([api('GET', '/api/admin/usuarios'), api('GET', '/api/admin/solicitudes')]);
  estado.usuariosAdmin = usuarios;
  const cuando = (ts) => new Date(ts).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  cont.innerHTML = `
    <div class="vista-cabecera">
      <h1>Usuarios <span class="sutil">${usuarios.filter((u) => u.activo).length} activos</span></h1>
      <div class="herramientas"><button type="button" class="boton primario" data-usr="nuevo">Nuevo usuario</button></div>
    </div>

    ${solicitudes.length ? `
    <section class="panel panel-alerta">
      <h2>Pedidos de contraseña <span class="cuenta">${solicitudes.length}</span></h2>
      <ul>${solicitudes.map((s) => `
        <li>
          <span class="crece"><strong>${esc(s.nombre)}</strong> · ${esc(s.email)}<div class="detalle">Lo pidió el ${esc(cuando(s.creada))}</div></span>
          <span class="mover">
            <button type="button" class="boton chico fantasma" data-usr="descartar" data-id="${s.id}" title="Si no lo reconocés, descartalo">Descartar</button>
            <button type="button" class="boton chico primario" data-usr="restablecer" data-id="${s.usuario_id}">Generar contraseña temporal</button>
          </span>
        </li>`).join('')}</ul>
      <p class="nota-regla">Confirmá con la persona que el pedido es suyo antes de pasarle la contraseña.</p>
    </section>` : ''}

    <div class="tabla-envoltura">
      <table class="tabla sin-clic">
        <thead><tr><th>Usuario</th><th>Estado</th><th class="num">Clientes</th><th></th></tr></thead>
        <tbody>${usuarios.map((u) => {
          const yo = u.id === estado.usuario.id;
          const estadoTxt = !u.activo ? '<span class="etiqueta-estado">Desactivado</span>'
            : u.debe_cambiar_password ? '<span class="etiqueta-estado e-hoy">Con contraseña temporal</span>'
            : '<span class="etiqueta-estado e-completada">Activo</span>';
          return `
          <tr class="${u.activo ? '' : 'hecha'}">
            <td><strong>${esc(u.nombre)}</strong>${yo ? ' <span class="sutil">(vos)</span>' : ''}${esDemo(u.email) ? ' <span class="sutil">· prueba</span>' : ''}${u.pidio_password ? ' <span class="etiqueta-estado e-vencida">Pidió contraseña</span>' : ''}
              <div class="sutil">${esc(u.email)} · ${u.rol === 'admin' ? 'Administrador' : 'Vendedor'}</div></td>
            <td>${estadoTxt}</td>
            <td class="num">${u.clientes}</td>
            <td class="acciones"><div class="botones-fila">
              <button type="button" class="boton chico fantasma" data-usr="editar" data-id="${u.id}">Editar</button>
              ${u.activo && !esDemo(u.email) ? `<button type="button" class="boton chico fantasma" data-usr="restablecer" data-id="${u.id}">Restablecer contraseña</button>` : ''}
              ${yo ? '' : `<button type="button" class="boton chico ${u.activo ? 'fantasma peligro-texto' : ''}" data-usr="activo" data-id="${u.id}" data-activo="${u.activo ? '0' : '1'}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}
              ${yo || esDemo(u.email) ? '' : `<button type="button" class="boton chico fantasma peligro-texto" data-usr="borrar" data-id="${u.id}" title="Borrar definitivamente">Borrar</button>`}
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <p class="nota-regla">Las cuentas de prueba (@demo.com) tienen la contraseña fija <code>demo123</code> para que la demo siempre funcione. Al desactivar a alguien se cierra su sesión; sus clientes y tareas quedan en el CRM y podés reasignarlos desde cada registro. Solo se puede <strong>borrar</strong> una cuenta que no tenga nada a su cargo.</p>`;
}

let usuarioEditado = null;

function abrirUsuario(u) {
  usuarioEditado = u || null;
  const form = $('#form-usuario');
  form.reset();
  errorEn(form, '');
  $('#usuario-titulo').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
  form.nombre.value = u?.nombre || '';
  form.email.value = u?.email || '';
  form.email.disabled = Boolean(u && esDemo(u.email));
  form.rol.value = u?.rol || 'vendedor';
  $('#usuario-info').textContent = u ? '' : 'Al guardar se genera una contraseña temporal para pasarle a la persona.';
  $('#dialogo-usuario').showModal();
  form.nombre.focus();
}

$('#form-usuario').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const datos = { nombre: form.nombre.value, rol: form.rol.value };
  if (!form.email.disabled) datos.email = form.email.value;
  try {
    if (usuarioEditado) {
      await api('PUT', `/api/admin/usuarios/${usuarioEditado.id}`, datos);
      $('#dialogo-usuario').close();
      avisar('Usuario actualizado.');
    } else {
      const r = await api('POST', '/api/admin/usuarios', datos);
      $('#dialogo-usuario').close();
      mostrarTemporal(r, true);
    }
    renderVista();
  } catch (e) {
    errorEn(form, e.message);
  }
});

$('#contenido').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-usr]');
  if (!b) return;
  const id = Number(b.dataset.id);
  const u = estado.usuariosAdmin?.find((x) => x.id === id);
  try {
    switch (b.dataset.usr) {
      case 'ir-usuarios':
        return irA('usuarios');
      case 'nuevo':
        return abrirUsuario(null);
      case 'editar':
        return abrirUsuario(u);
      case 'restablecer': {
        const nombre = u?.nombre || 'esta persona';
        if (!confirm(`¿Generar una contraseña temporal para ${nombre}? Su contraseña actual deja de funcionar y se cierran sus sesiones.`)) return;
        mostrarTemporal(await api('POST', `/api/admin/usuarios/${id}/restablecer`), false);
        return renderVista();
      }
      case 'activo': {
        const activar = b.dataset.activo === '1';
        if (!activar && !confirm(`¿Desactivar a ${u.nombre}? No va a poder ingresar y se cierra su sesión.`)) return;
        await api('PUT', `/api/admin/usuarios/${id}`, { activo: activar });
        avisar(activar ? 'Usuario activado.' : 'Usuario desactivado.');
        return renderVista();
      }
      case 'borrar': {
        if (!confirm(`¿Borrar definitivamente la cuenta de ${u.nombre} (${u.email})? Esto no se puede deshacer.`)) return;
        await api('DELETE', `/api/admin/usuarios/${id}`);
        avisar('Usuario borrado.');
        return renderVista();
      }
      case 'descartar':
        await api('POST', `/api/admin/solicitudes/${id}/descartar`);
        avisar('Pedido descartado.');
        return renderVista();
    }
  } catch (e) {
    avisar(e.message);
  }
});

// ===========================================================================
// Gráficos de Inicio (barras en HTML: una sola serie, color primario)
// ===========================================================================

const pesosCorto = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 });

/** Barras horizontales. filas: [{ etiqueta, valor, textoValor, tip }] */
function barrasHorizontales(filas) {
  const max = Math.max(...filas.map((f) => f.valor), 0);
  return `<div class="g-barras">${filas.map((f) => {
    const ancho = max > 0 ? Math.max((f.valor / max) * 100, f.valor > 0 ? 1.5 : 0) : 0;
    return `
      <div class="g-fila">
        <span class="g-etiqueta">${esc(f.etiqueta)}</span>
        <span class="g-pista">
          <span class="g-barra" style="width:${ancho}%" tabindex="0" data-tip-valor="${esc(f.textoValor)}" data-tip-texto="${esc(f.tip)}"></span>
          <span class="g-valor">${esc(f.textoValor)}</span>
        </span>
      </div>`;
  }).join('')}</div>`;
}

/** Columnas verticales (serie temporal corta). cols: [{ etiqueta, valor, tip, rotular }] */
function columnas(cols) {
  const max = Math.max(...cols.map((c) => c.valor), 1);
  return `<div class="g-columnas" style="--n:${cols.length}">${cols.map((c) => `
      <div class="g-col">
        <span class="g-col-area" style="--alto:${(c.valor / max) * 100}%">
          ${c.rotular ? `<span class="g-col-valor">${c.valor}</span>` : ''}
          <span class="g-columna" style="height:var(--alto)" tabindex="0" data-tip-valor="${c.valor}" data-tip-texto="${esc(c.tip)}"></span>
        </span>
        <span class="g-col-etiqueta">${esc(c.etiqueta)}</span>
      </div>`).join('')}</div>`;
}

/** Tabla equivalente, para leer los valores sin depender del gráfico. */
function tablaGrafico(encabezados, filas) {
  return `<details class="g-tabla"><summary>Ver como tabla</summary><table>
    <thead><tr>${encabezados.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${f.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></details>`;
}

function seccionGraficos(opos, actividades) {
  // 1) Monto por etapa del embudo
  const porEtapa = ETAPAS.map((etapa) => {
    const lista = opos.filter((o) => o.etapa === etapa);
    const monto = lista.reduce((s, o) => s + (o.monto || 0), 0);
    const sinMonto = lista.filter((o) => o.monto == null).length;
    return { etapa, monto, cantidad: lista.length, sinMonto };
  });
  const detalleEtapa = (e) => `${e.cantidad} ${e.cantidad === 1 ? 'oportunidad' : 'oportunidades'}${e.sinMonto ? ` (${e.sinMonto} sin monto)` : ''}`;
  const g1 = `
    <section class="panel grafico">
      <h2>Monto por etapa del embudo</h2>
      <p class="g-sub">Suma de las oportunidades en cada etapa. "Cerrado" es lo ya ganado.</p>
      ${barrasHorizontales(porEtapa.map((e) => ({ etiqueta: ETIQUETAS[e.etapa], valor: e.monto, textoValor: pesosCorto.format(e.monto), tip: `${ETIQUETAS[e.etapa]} · ${detalleEtapa(e)}` })))}
      ${tablaGrafico(['Etapa', 'Monto', 'Oportunidades'], porEtapa.map((e) => [ETIQUETAS[e.etapa], pesos.format(e.monto), detalleEtapa(e)]))}
    </section>`;

  // 2) Actividades por semana (últimas 8, semanas de lunes a domingo)
  const hoy = new Date();
  const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const inicio = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() - (7 - i) * 7);
    return { inicio, cantidad: 0 };
  });
  for (const a of actividades) {
    const [y, m, d] = a.fecha.split('-').map(Number);
    const dias = Math.round((new Date(y, m - 1, d) - semanas[0].inicio) / 86400000);
    const i = Math.floor(dias / 7);
    if (i >= 0 && i < semanas.length) semanas[i].cantidad++;
  }
  const dm = (f) => `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}`;
  const maxSemana = Math.max(...semanas.map((s) => s.cantidad));
  const ultima = semanas.length - 1;
  const g2 = `
    <section class="panel grafico">
      <h2>Actividades por semana</h2>
      <p class="g-sub">Llamadas, reuniones, emails y visitas registradas en las últimas 8 semanas.</p>
      ${columnas(semanas.map((s, i) => ({
        etiqueta: i === ultima ? 'Esta' : dm(s.inicio),
        valor: s.cantidad,
        rotular: i === ultima || (s.cantidad === maxSemana && maxSemana > 0),
        tip: `Semana del ${dm(s.inicio)}${i === ultima ? ' (esta semana)' : ''} · ${s.cantidad === 1 ? 'actividad' : 'actividades'}`,
      })))}
      ${tablaGrafico(['Semana del', 'Actividades'], semanas.map((s) => [dm(s.inicio), String(s.cantidad)]))}
    </section>`;

  // 3) Solo administración: monto abierto por vendedor
  let g3 = '';
  if (esAdmin()) {
    const porVendedor = new Map();
    for (const o of opos) {
      if (o.etapa === 'cerrado') continue;
      const v = porVendedor.get(o.responsable) || { monto: 0, cantidad: 0 };
      v.monto += o.monto || 0;
      v.cantidad++;
      porVendedor.set(o.responsable, v);
    }
    const filas = [...porVendedor.entries()].sort((a, b) => b[1].monto - a[1].monto);
    g3 = `
    <section class="panel grafico">
      <h2>Monto abierto por vendedor</h2>
      <p class="g-sub">Oportunidades sin cerrar a cargo de cada persona.</p>
      ${filas.length ? barrasHorizontales(filas.map(([nombre, v]) => ({ etiqueta: nombre, valor: v.monto, textoValor: pesosCorto.format(v.monto), tip: `${nombre} · ${v.cantidad} ${v.cantidad === 1 ? 'oportunidad abierta' : 'oportunidades abiertas'}` }))) : '<p class="vacio">No hay oportunidades abiertas.</p>'}
      ${filas.length ? tablaGrafico(['Vendedor', 'Monto abierto', 'Oportunidades'], filas.map(([n, v]) => [n, pesos.format(v.monto), String(v.cantidad)])) : ''}
    </section>`;
  }

  return `<h2 class="subtitulo">Gráficos</h2><div class="paneles graficos">${g1}${g2}${g3}</div>`;
}

// Tooltip compartido de los gráficos (hover y foco con teclado)
const tip = document.createElement('div');
tip.className = 'g-tip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
tip.innerHTML = '<strong></strong><span></span>';
document.body.appendChild(tip);

function mostrarTip(marca) {
  tip.firstChild.textContent = marca.dataset.tipValor;
  tip.lastChild.textContent = marca.dataset.tipTexto;
  tip.hidden = false;
  const r = marca.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  const y = r.top - t.height - 8 < 8 ? r.bottom + 8 : r.top - t.height - 8;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
const ocultarTip = () => (tip.hidden = true);
$('#contenido').addEventListener('pointerover', (ev) => {
  const m = ev.target.closest('[data-tip-valor]');
  if (m) mostrarTip(m);
});
$('#contenido').addEventListener('pointerout', (ev) => {
  if (ev.target.closest('[data-tip-valor]')) ocultarTip();
});
$('#contenido').addEventListener('focusin', (ev) => {
  const m = ev.target.closest('[data-tip-valor]');
  if (m) mostrarTip(m);
});
$('#contenido').addEventListener('focusout', ocultarTip);
$('#contenido').addEventListener('scroll', ocultarTip);

// ===========================================================================
// Recordatorio de tareas vencidas (dentro de la app)
// ===========================================================================

function leerGuardado(clave) {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: se vuelve a mostrar */ }
}

/** Insignia en "Tareas" y, al entrar, una ventana con las vencidas (una vez por día). */
async function revisarVencidas(alEntrar) {
  if (!estado.usuario) return;
  let tareas;
  try {
    tareas = await api('GET', '/api/tareas');
  } catch {
    return;
  }
  const mias = tareas
    .filter((t) => t.asignado_id === estado.usuario.id && t.estado !== 'completada' && diasDesde(t.fecha_limite) > 0)
    .sort((a, b) => diasDesde(b.fecha_limite) - diasDesde(a.fecha_limite));

  const insignia = $('#insignia-vencidas');
  insignia.textContent = mias.length;
  insignia.hidden = !mias.length;

  const clave = `recordatorio-${estado.usuario.id}-${hoyISO()}`;
  if (!alEntrar || !mias.length || leerGuardado(clave)) return;
  guardar(clave, '1');

  $('#recordatorio-titulo').textContent = mias.length === 1 ? 'Tenés 1 tarea vencida' : `Tenés ${mias.length} tareas vencidas`;
  $('#recordatorio-lista').innerHTML = mias.slice(0, 8).map((t) => {
    const d = diasDesde(t.fecha_limite);
    return `<li><span class="crece"><strong>${esc(t.titulo)}</strong>${t.cliente ? ` · ${esc(t.cliente)}` : ''}</span>
      <span class="detalle">vencida hace ${d} ${d === 1 ? 'día' : 'días'} · ${etiqueta(t.prioridad)}</span></li>`;
  }).join('') + (mias.length > 8 ? `<li class="sutil">y ${mias.length - 8} más…</li>` : '');
  $('#dialogo-recordatorio').showModal();
}

$('#recordatorio-ver').addEventListener('click', () => {
  $('#dialogo-recordatorio').close();
  irA('tareas');
});

// ===========================================================================
// Búsqueda global (barra superior, Ctrl+K)
// ===========================================================================

const NOMBRES_GRUPO = { clientes: 'Clientes', contactos: 'Contactos', oportunidades: 'Oportunidades', tareas: 'Tareas', actividades: 'Actividades' };
const campoBuscar = $('#buscar');
const panelResultados = $('#buscar-resultados');
let busquedaPendiente;
let numeroBusqueda = 0;

function cerrarResultados() {
  panelResultados.hidden = true;
  campoBuscar.setAttribute('aria-expanded', 'false');
}

async function ejecutarBusqueda() {
  const q = campoBuscar.value.trim();
  if (q.length < 2) return cerrarResultados();
  const esta = ++numeroBusqueda;
  let r;
  try {
    r = await api('GET', `/api/buscar?q=${encodeURIComponent(q)}`);
  } catch (e) {
    return avisar(e.message);
  }
  if (esta !== numeroBusqueda) return; // llegó una búsqueda más nueva

  panelResultados.innerHTML = r.grupos.length
    ? r.grupos.map((g) => `
        <div class="br-grupo">
          <div class="br-titulo">${NOMBRES_GRUPO[g.tipo]}${g.total > g.items.length ? ` <span class="sutil">(${g.items.length} de ${g.total})</span>` : ''}</div>
          ${g.items.map((i) => `
            <button type="button" class="br-item" role="option" data-tipo="${g.tipo}" data-id="${i.id}" data-cliente="${i.cliente_id ?? ''}">
              <span class="br-nombre">${esc(i.titulo)}</span>
              <span class="br-detalle">${esc(i.detalle)}</span>
              ${i.estado ? etiqueta(i.estado) : ''}
            </button>`).join('')}
        </div>`).join('')
    : `<p class="br-vacio">No encontré nada con "${esc(q)}".</p>`;
  panelResultados.hidden = false;
  campoBuscar.setAttribute('aria-expanded', 'true');
}

campoBuscar.addEventListener('input', () => {
  clearTimeout(busquedaPendiente);
  busquedaPendiente = setTimeout(ejecutarBusqueda, 200);
});
campoBuscar.addEventListener('focus', () => {
  if (campoBuscar.value.trim().length >= 2 && panelResultados.innerHTML) {
    panelResultados.hidden = false;
    campoBuscar.setAttribute('aria-expanded', 'true');
  }
});

async function abrirResultado(boton) {
  const { tipo } = boton.dataset;
  const id = Number(boton.dataset.id);
  const clienteId = Number(boton.dataset.cliente);
  cerrarResultados();
  campoBuscar.blur();
  $('#chat').classList.remove('abierto');
  if (tipo === 'clientes') return irA('ficha', id);
  if (clienteId) return irA('ficha', clienteId); // la ficha reúne todo lo del cliente
  // Tarea sin cliente: abrir directamente su formulario
  irA(tipo);
  const registro = (await api('GET', `/api/${tipo}`)).find((x) => x.id === id);
  if (registro) abrirFormulario(tipo, registro);
}

panelResultados.addEventListener('click', (ev) => {
  const b = ev.target.closest('.br-item');
  if (b) abrirResultado(b);
});

// Teclado: flechas para moverse, Enter para abrir, Escape para cerrar
$('#buscador').addEventListener('keydown', (ev) => {
  const items = [...panelResultados.querySelectorAll('.br-item')];
  const i = items.indexOf(document.activeElement);
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    (items[i + 1] || items[0])?.focus();
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    if (i <= 0) campoBuscar.focus();
    else items[i - 1].focus();
  } else if (ev.key === 'Enter' && document.activeElement === campoBuscar && items[0]) {
    ev.preventDefault();
    abrirResultado(items[0]);
  } else if (ev.key === 'Escape') {
    cerrarResultados();
    campoBuscar.focus();
  }
});

document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#buscador')) cerrarResultados();
});
document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k' && estado.usuario && !$('#pantalla-app').hidden) {
    ev.preventDefault();
    campoBuscar.focus();
    campoBuscar.select();
  }
});

// ===========================================================================
// Chat con Agenda Inteligente
// ===========================================================================

const chat = { ocupado: false, configurado: true };
const zonaMensajes = $('#chat-mensajes');
const entrada = $('#chat-entrada');

function agregarMensaje(clase, html) {
  const el = document.createElement('div');
  el.className = `msg ${clase}`;
  el.innerHTML = html;
  zonaMensajes.appendChild(el);
  zonaMensajes.scrollTop = zonaMensajes.scrollHeight;
  return el;
}

function bienvenida() {
  const nombre = esc(estado.usuario.nombre.split(' ')[0]);
  agregarMensaje(
    'asistente bienvenida',
    `<p>¡Hola, <strong>${nombre}</strong>! Soy tu asistente comercial. Puedo armarte la agenda del día, sugerirte el próximo paso con un cliente, resumirte un cliente, redactarte borradores de mensajes o avisarte qué está atrasado.</p><p>Leo el CRM pero nunca lo modifico ni envío mensajes: la decisión siempre es tuya.</p>`
  );
  if (!chat.configurado) {
    agregarMensaje('error', '<p class="error">Falta configurar la clave de la API de Claude. Copiá <code>.env.example</code> como <code>.env</code>, completá <code>ANTHROPIC_API_KEY</code> y reiniciá la app. El resto del CRM funciona igual.</p>');
  }
}

async function iniciarChat() {
  zonaMensajes.innerHTML = '';
  try {
    const e = await api('GET', '/api/asistente/estado');
    chat.configurado = e.configurado;
    $('#chat-modelo').textContent = e.modelo;
  } catch { /* se informa al enviar */ }
  bienvenida();
  $('#chat-sugerencias').hidden = false;
}

function botonCopiar(burbuja, texto) {
  const pie = document.createElement('div');
  pie.className = 'msg-pie';
  pie.innerHTML = '<button type="button">Copiar</button>';
  pie.firstChild.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(texto);
      avisar('Copiado al portapapeles.');
    } catch {
      avisar('No se pudo copiar.');
    }
  });
  burbuja.appendChild(pie);
}

async function enviar(texto) {
  texto = texto.trim();
  if (!texto || chat.ocupado) return;
  chat.ocupado = true;
  $('#chat-enviar').disabled = true;
  $('#chat-sugerencias').hidden = true;
  entrada.value = '';

  agregarMensaje('usuario', esc(texto));
  const burbuja = agregarMensaje('asistente', '<span class="escribiendo"><span></span><span></span><span></span></span>');
  let acumulado = '';
  let pendiente = false;
  const pintar = () => {
    pendiente = false;
    burbuja.innerHTML = window.markdownAHtml(acumulado);
    zonaMensajes.scrollTop = zonaMensajes.scrollHeight;
  };

  try {
    const res = await fetch('/api/asistente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: texto }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      if (res.status === 401) mostrarLogin();
      throw new Error(e.error || `Error ${res.status}`);
    }

    const lector = res.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = '';
    let terminado = false;
    while (!terminado) {
      const { value, done } = await lector.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      const eventos = buffer.split('\n\n');
      buffer = eventos.pop();
      for (const bloque of eventos) {
        const linea = bloque.split('\n').find((l) => l.startsWith('data: '));
        if (!linea) continue;
        const ev = JSON.parse(linea.slice(6));
        if (ev.type === 'text') {
          acumulado += ev.text;
          if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); }
        } else if (ev.type === 'reset') {
          acumulado = '';
        } else if (ev.type === 'aviso') {
          agregarMensaje('sistema', esc(ev.text));
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        } else if (ev.type === 'done') {
          terminado = true;
        }
      }
    }
    pintar();
    if (!acumulado.trim()) burbuja.innerHTML = '<span class="falta">(sin respuesta)</span>';
    else botonCopiar(burbuja, acumulado);
  } catch (e) {
    if (acumulado.trim()) pintar();
    else burbuja.remove();
    agregarMensaje('error', `<p class="error">${esc(e.message)}</p>`);
  } finally {
    chat.ocupado = false;
    $('#chat-enviar').disabled = false;
    entrada.focus();
  }
}

$('#chat-form').addEventListener('submit', (ev) => { ev.preventDefault(); enviar(entrada.value); });
entrada.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(entrada.value); }
});
$('#chat-sugerencias').addEventListener('click', (ev) => {
  const b = ev.target.closest('.chip');
  if (b) enviar(b.textContent);
});
$('#boton-reiniciar').addEventListener('click', async () => {
  if (chat.ocupado) return;
  await api('POST', '/api/asistente/reiniciar').catch(() => {});
  iniciarChat();
});
$('#boton-chat-movil').addEventListener('click', () => { $('#chat').classList.add('abierto'); entrada.focus(); });
$('#boton-cerrar-chat').addEventListener('click', () => $('#chat').classList.remove('abierto'));

// ===========================================================================
// Arranque
// ===========================================================================

api('GET', '/api/me').then(entrar).catch(mostrarLogin);
