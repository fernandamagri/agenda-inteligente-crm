-- Esquema de la base de datos (Postgres). Se puede ejecutar varias veces sin romper nada.
-- RLS activado sin políticas: la app entra con su propio usuario de base de datos, y la API
-- pública de Supabase no puede leer ni escribir estas tablas.

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL CHECK (rol IN ('vendedor', 'admin')),
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  empresa TEXT,
  estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'caliente', 'negociacion', 'cerrado')),
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  notas TEXT
);

CREATE TABLE IF NOT EXISTS contactos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  cargo TEXT,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS oportunidades (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  monto DOUBLE PRECISION,
  etapa TEXT NOT NULL DEFAULT 'prospecto' CHECK (etapa IN ('prospecto', 'propuesta', 'negociacion', 'cerrado')),
  fecha_cambio_etapa DATE NOT NULL,
  probabilidad INTEGER CHECK (probabilidad BETWEEN 0 AND 100),
  fecha_cierre DATE,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS tareas (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha_limite DATE,
  prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_progreso', 'completada')),
  asignado_id INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS actividades (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('llamada', 'reunion', 'email', 'visita')),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha DATE NOT NULL,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS clientes_responsable_idx ON clientes (responsable_id);
CREATE INDEX IF NOT EXISTS contactos_cliente_idx ON contactos (cliente_id);
CREATE INDEX IF NOT EXISTS oportunidades_cliente_idx ON oportunidades (cliente_id);
CREATE INDEX IF NOT EXISTS oportunidades_responsable_idx ON oportunidades (responsable_id);
CREATE INDEX IF NOT EXISTS tareas_cliente_idx ON tareas (cliente_id);
CREATE INDEX IF NOT EXISTS tareas_asignado_idx ON tareas (asignado_id);
CREATE INDEX IF NOT EXISTS actividades_cliente_idx ON actividades (cliente_id);
CREATE INDEX IF NOT EXISTS actividades_responsable_idx ON actividades (responsable_id);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;
