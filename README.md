# Agenda Inteligente · CRM

CRM de ventas con **Agenda Inteligente**, el asistente comercial diseñado en la carpeta [`docs/`](docs/).
El asistente funciona con Claude y usa como instrucciones los documentos `LEGEND.md`, `AGENTS.md`,
`CONTEXT.md` y `TASK.md`, tal cual están escritos.

> **Para la corrección:** el informe completo está en **[`INFORME.md`](INFORME.md)**: qué hace el proyecto, cómo el
> diseño de `docs/` se convirtió en la app, un recorrido para evaluarla, decisiones, seguridad y estado actual.

**App online:** <https://agenda-inteligente-crm.onrender.com> (la primera visita puede tardar hasta un minuto).
Usuarios de prueba, con contraseña `demo123`: `ana@demo.com` (vendedora), `luis@demo.com` (vendedor) y
`admin@demo.com` (administradora). En la pantalla de ingreso hay un botón para cada uno.

## Cómo ejecutarla en una computadora

Requisitos: **Node.js 22.13 o superior** y una base de datos **Postgres** (por ejemplo, Supabase).

```bash
npm install
cp .env.example .env      # y completá DATABASE_URL y ANTHROPIC_API_KEY
npm start
```

Después abrí <http://localhost:3000>.

- La primera vez que arranca con una base vacía, crea las tablas y carga los datos de ejemplo de `docs/TESTING.md`.
- Sin `ANTHROPIC_API_KEY` (o sin crédito en la API) el CRM funciona igual; solo el asistente no responde.
- `DATABASE_URL` es la dirección de conexión de Postgres. En Supabase: *Conectar → Directo → Administrador de sesiones* (Session pooler).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia la app |
| `npm run dev` | Inicia la app y la reinicia sola al cambiar el código |
| `npm run backup` | Guarda una copia de seguridad en `backups/` (conserva las 30 más nuevas) |
| `npm run restaurar -- <archivo> --probar` | Restaura una copia, verifica que quede completa y deshace todo: no cambia nada |
| `npm run restaurar -- <archivo> --confirmar` | Reemplaza **todos** los datos por los de la copia (todo o nada) |
| `npm run reset-db -- --confirmar` | Borra **todo** y vuelve a los datos de ejemplo |

**Copia automática semanal:** en la computadora de desarrollo, el Programador de tareas de Windows ejecuta
[`scripts/copia-semanal.cmd`](scripts/copia-semanal.cmd) **todos los viernes a las 18:00** (tarea
*"Agenda CRM - copia semanal"*). Si la computadora está apagada a esa hora, la copia se hace apenas se prende. El
resultado de cada ejecución queda en `backups/registro.txt`. Para quitarla:
`schtasks /Delete /TN "Agenda CRM - copia semanal" /F`.

Ojo: la base de datos es la misma que usa la app online, así que `restaurar --confirmar` y `reset-db` también cambian
los datos de la app publicada. Las copias de seguridad incluyen los hash de las contraseñas: guardalas en un lugar
privado (la carpeta `backups/` no se sube a GitHub).

## Configuración (`.env`)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a Postgres (obligatoria) |
| `ANTHROPIC_API_KEY` | Clave de la API de Claude, para el asistente |
| `PORT` | Puerto (por defecto 3000) |
| `CLAUDE_MODEL` | Modelo de Claude (por defecto `claude-opus-5-5`) |
| `TZ` | Zona horaria para calcular "hoy" (en Render: `America/Argentina/Buenos_Aires`) |

## Publicación

- **App:** Render, conectada a la rama `main` de GitHub: cada cambio se publica solo en uno o dos minutos. Las
  variables `DATABASE_URL`, `ANTHROPIC_API_KEY`, `NODE_VERSION=24` y `TZ` están configuradas en Render.
- **Datos:** Postgres en Supabase. Las tablas tienen RLS activado sin políticas, así que la API pública de Supabase no
  puede leerlas: solo la app, que entra con su propia conexión.

## Estructura

```
docs/              Diseño del asistente (instrucciones de Claude)
INFORME.md         Informe del proyecto
server.js          Servidor web: rutas y permisos de cada pedido
src/asistente.js   Integración con Claude
src/crm.js         Datos del CRM con permisos, resumen del día, ficha y equipo
src/db.js          Conexión a Postgres y datos de ejemplo
src/esquema.sql    Tablas de la base de datos
src/usuarios.js    Cuentas y contraseñas
src/sesiones.js    Sesiones e intentos de ingreso
src/claves.js      Hash de contraseñas y contraseñas temporales
src/buscar.js      Búsqueda global
src/exportar.js    Exportación a Excel
src/copias.js      Copias de seguridad (backup.js y restaurar.js son los comandos)
src/reset-db.js    Vuelve a los datos de ejemplo
scripts/           copia-semanal.cmd: la copia automática de los viernes
public/            Interfaz web (HTML, CSS y JavaScript)
```
