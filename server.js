import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararBase, uno } from './src/db.js';
import { verificarPassword } from './src/claves.js';
import {
  COOKIE, bloqueado, cerrarSesion, cookieBorrada, cookieDeSesion, crearSesion, leerCookie,
  limpiarIntentos, registrarIntento, usuarioDeSesion,
} from './src/sesiones.js';
import { ENTIDADES, ErrorCRM, actualizar, calcularResumen, crear, eliminar, fichaCliente, listar, listarUsuarios, resumenEquipo } from './src/crm.js';
import {
  actualizarUsuario, cambiarPassword, crearUsuario, descartarSolicitud, listarSolicitudes,
  listarUsuariosAdmin, pedirRestablecimiento, restablecerPassword,
} from './src/usuarios.js';
import { MODELO, conversar, credencialesConfiguradas } from './src/asistente.js';

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;
const aqui = path.dirname(fileURLToPath(import.meta.url));

app.set('trust proxy', 1); // Render atiende HTTPS adelante: así la cookie sale marcada como segura
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(aqui, 'public')));

const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, debeCambiarPassword: Boolean(u.debe_cambiar_password) });
const idValido = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorCRM('Identificador inválido.', 400);
  return id;
};

// --- Sesión -----------------------------------------------------------------

// Conversaciones con el asistente, por sesión (en memoria: se pierden si el servidor se reinicia).
const conversaciones = new Map();

async function conSesion(req, res, next) {
  const token = leerCookie(req, COOKIE);
  const usuario = await usuarioDeSesion(token);
  if (!usuario) return res.status(401).json({ error: 'Tenés que iniciar sesión.' });
  req.token = token;
  req.usuario = usuario;
  if (!conversaciones.has(token)) conversaciones.set(token, { conversacion: [] });
  req.sesion = conversaciones.get(token);
  next();
}

/** Además de la sesión, exige que no haya una contraseña temporal pendiente de cambio. */
function requiereSesion(req, res, next) {
  conSesion(req, res, () => {
    if (req.usuario.debe_cambiar_password) {
      return res.status(403).json({ error: 'Tenés que elegir una contraseña nueva antes de seguir.', debeCambiarPassword: true });
    }
    next();
  }).catch(next);
}

app.post('/api/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const claveIp = `ip:${req.ip}`;
  const claveEmail = `email:${email}`;
  if (bloqueado(claveIp, 30, 15) || bloqueado(claveEmail, 8, 15)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.' });
  }

  const fila = await uno('SELECT * FROM usuarios WHERE email = :email', { email });
  if (!fila || !verificarPassword(password, fila.password_hash)) {
    registrarIntento(claveIp);
    registrarIntento(claveEmail);
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }
  if (!fila.activo) {
    return res.status(403).json({ error: 'Tu cuenta está desactivada. Consultá con la administración.' });
  }
  limpiarIntentos(claveEmail);
  const token = await crearSesion(fila.id);
  res.setHeader('Set-Cookie', cookieDeSesion(token, req));
  res.json(publico(fila));
});

app.post('/api/logout', async (req, res) => {
  const token = leerCookie(req, COOKIE);
  await cerrarSesion(token);
  conversaciones.delete(token);
  res.setHeader('Set-Cookie', cookieBorrada(req));
  res.json({ ok: true });
});

app.get('/api/me', conSesion, (req, res) => res.json(publico(req.usuario)));

// --- Contraseñas -------------------------------------------------------------

app.post('/api/password/cambiar', conSesion, async (req, res) => {
  await cambiarPassword(req.usuario, req.body?.actual, req.body?.nueva, req.token);
  res.json({ ok: true });
});

app.post('/api/password/olvide', async (req, res) => {
  const claveIp = `olvide:${req.ip}`;
  if (bloqueado(claveIp, 5, 60)) {
    return res.status(429).json({ error: 'Ya enviaste varios pedidos. Probá de nuevo en una hora.' });
  }
  registrarIntento(claveIp);
  await pedirRestablecimiento(req.body?.email);
  res.json({ ok: true }); // misma respuesta exista o no la cuenta
});

// --- Administración de usuarios (solo administrador) -----------------------

app.get('/api/admin/usuarios', requiereSesion, async (req, res) => res.json(await listarUsuariosAdmin(req.usuario)));
app.post('/api/admin/usuarios', requiereSesion, async (req, res) => res.status(201).json(await crearUsuario(req.usuario, req.body)));
app.put('/api/admin/usuarios/:id', requiereSesion, async (req, res) =>
  res.json(await actualizarUsuario(req.usuario, idValido(req), req.body || {}))
);
app.post('/api/admin/usuarios/:id/restablecer', requiereSesion, async (req, res) =>
  res.json(await restablecerPassword(req.usuario, idValido(req)))
);
app.get('/api/admin/solicitudes', requiereSesion, async (req, res) => res.json(await listarSolicitudes(req.usuario)));
app.post('/api/admin/solicitudes/:id/descartar', requiereSesion, async (req, res) => {
  await descartarSolicitud(req.usuario, idValido(req));
  res.json({ ok: true });
});

// --- CRM ----------------------------------------------------------------------

app.get('/api/usuarios', requiereSesion, async (req, res) => res.json(await listarUsuarios(req.usuario)));
app.get('/api/resumen', requiereSesion, async (req, res) => res.json(await calcularResumen(req.usuario)));
app.get('/api/equipo', requiereSesion, async (req, res) => res.json(await resumenEquipo(req.usuario)));
app.get('/api/clientes/:id/ficha', requiereSesion, async (req, res) => res.json(await fichaCliente(req.usuario, idValido(req))));

// Solo las entidades conocidas pasan; el resto sigue a las rutas siguientes.
const esEntidad = (req, res, next) => (Object.hasOwn(ENTIDADES, req.params.entidad) ? next() : next('route'));

app.get('/api/:entidad', esEntidad, requiereSesion, async (req, res) => {
  res.json(await listar(req.params.entidad, req.usuario));
});
app.post('/api/:entidad', esEntidad, requiereSesion, async (req, res) => {
  res.status(201).json(await crear(req.params.entidad, req.usuario, req.body));
});
app.put('/api/:entidad/:id', esEntidad, requiereSesion, async (req, res) => {
  res.json(await actualizar(req.params.entidad, req.usuario, idValido(req), req.body));
});
app.delete('/api/:entidad/:id', esEntidad, requiereSesion, async (req, res) => {
  await eliminar(req.params.entidad, req.usuario, idValido(req));
  res.json({ ok: true });
});

// --- Asistente -------------------------------------------------------------

app.get('/api/asistente/estado', requiereSesion, (req, res) => {
  res.json({ configurado: credencialesConfiguradas(), modelo: MODELO });
});

app.post('/api/asistente/reiniciar', requiereSesion, (req, res) => {
  req.sesion.conversacion = [];
  res.json({ ok: true });
});

app.post('/api/asistente', requiereSesion, async (req, res) => {
  const mensaje = String(req.body?.mensaje || '').trim();
  if (!mensaje) return res.status(400).json({ error: 'Escribí un mensaje.' });
  if (mensaje.length > 4000) return res.status(400).json({ error: 'El mensaje es demasiado largo.' });
  if (req.sesion.ocupado) return res.status(409).json({ error: 'Esperá a que termine la respuesta anterior.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const control = new AbortController();
  res.on('close', () => control.abort());
  const emitir = (evento) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(evento)}\n\n`);
  };

  req.sesion.ocupado = true;
  try {
    await conversar(req.sesion, req.usuario, mensaje, emitir, control.signal);
  } finally {
    req.sesion.ocupado = false;
    res.end();
  }
});

// --- Errores ------------------------------------------------------------------

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.use((err, req, res, next) => {
  if (err instanceof ErrorCRM) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

try {
  await prepararBase();
} catch (err) {
  console.error('\nNo se pudo conectar con la base de datos:', err.message);
  console.error('Revisá DATABASE_URL (en el archivo .env o en las variables de entorno de Render).\n');
  process.exit(1);
}

app.listen(PUERTO, (err) => {
  // En Express 5 los errores al abrir el puerto llegan a este mismo callback.
  if (err) {
    console.error(
      err.code === 'EADDRINUSE'
        ? `\nEl puerto ${PUERTO} ya está en uso: probablemente la app ya está abierta en otra terminal.\nCerrala o usá otro puerto (PORT=3001 en el archivo .env).`
        : `\nNo se pudo iniciar el servidor: ${err.message}`
    );
    process.exit(1);
  }
  console.log(`\nAgenda Inteligente CRM funcionando en http://localhost:${PUERTO}`);
  console.log('Usuarios de prueba (contraseña demo123): ana@demo.com, luis@demo.com, admin@demo.com');
  if (!credencialesConfiguradas()) {
    console.log('\nAviso: no hay ANTHROPIC_API_KEY configurada. El CRM funciona, pero el asistente no va a responder.');
    console.log('Copiá .env.example como .env, completá la clave y reiniciá la app.\n');
  }
});
