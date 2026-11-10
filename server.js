import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './src/db.js';
import { COOKIE, cerrarSesion, crearSesion, leerCookie, obtenerSesion, verificarPassword } from './src/auth.js';
import { ENTIDADES, ErrorCRM, actualizar, calcularResumen, crear, eliminar, fichaCliente, listar, listarUsuarios, resumenEquipo } from './src/crm.js';
import { MODELO, conversar, credencialesConfiguradas } from './src/asistente.js';

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;
const aqui = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(aqui, 'public')));

// --- Sesión -----------------------------------------------------------------

function usuarioPorId(id) {
  return db.prepare('SELECT id, nombre, email, rol FROM usuarios WHERE id = ?').get(id);
}

function requiereSesion(req, res, next) {
  const token = leerCookie(req, COOKIE);
  const sesion = obtenerSesion(token);
  const usuario = sesion && usuarioPorId(sesion.usuarioId);
  if (!usuario) return res.status(401).json({ error: 'Tenés que iniciar sesión.' });
  req.token = token;
  req.sesion = sesion;
  req.usuario = { ...usuario };
  next();
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const fila = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!fila || !verificarPassword(String(password || ''), fila.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }
  const token = crearSesion(fila.id);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`);
  res.json({ id: fila.id, nombre: fila.nombre, email: fila.email, rol: fila.rol });
});

app.post('/api/logout', requiereSesion, (req, res) => {
  cerrarSesion(req.token);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/me', requiereSesion, (req, res) => res.json(req.usuario));

// --- CRM ----------------------------------------------------------------------

app.get('/api/usuarios', requiereSesion, (req, res) => res.json(listarUsuarios(req.usuario)));
app.get('/api/resumen', requiereSesion, (req, res) => res.json(calcularResumen(req.usuario)));
app.get('/api/equipo', requiereSesion, (req, res) => res.json(resumenEquipo(req.usuario)));
app.get('/api/clientes/:id/ficha', requiereSesion, (req, res) => res.json(fichaCliente(req.usuario, idValido(req))));

// Solo las entidades conocidas pasan; el resto sigue a las rutas siguientes.
const esEntidad = (req, res, next) => (Object.hasOwn(ENTIDADES, req.params.entidad) ? next() : next('route'));
const idValido = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorCRM('Identificador inválido.', 400);
  return id;
};

app.get('/api/:entidad', esEntidad, requiereSesion, (req, res) => {
  res.json(listar(req.params.entidad, req.usuario));
});
app.post('/api/:entidad', esEntidad, requiereSesion, (req, res) => {
  res.status(201).json(crear(req.params.entidad, req.usuario, req.body));
});
app.put('/api/:entidad/:id', esEntidad, requiereSesion, (req, res) => {
  res.json(actualizar(req.params.entidad, req.usuario, idValido(req), req.body));
});
app.delete('/api/:entidad/:id', esEntidad, requiereSesion, (req, res) => {
  eliminar(req.params.entidad, req.usuario, idValido(req));
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
