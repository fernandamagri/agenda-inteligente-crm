# Agenda Inteligente · CRM

CRM de ventas con **Agenda Inteligente**, el asistente comercial diseñado en la carpeta [`docs/`](docs/).
El asistente funciona con Claude y usa como instrucciones los documentos `LEGEND.md`, `AGENTS.md`,
`CONTEXT.md` y `TASK.md`, tal cual están escritos.

## Cómo ejecutarla

Requisitos: Node.js 22.13 o superior y una base de datos Postgres (por ejemplo, Supabase).

```bash
npm install
cp .env.example .env      # y completá DATABASE_URL y ANTHROPIC_API_KEY
npm start
```

Abrí <http://localhost:3000>. Usuarios de prueba (contraseña `demo123`):

| Usuario | Rol | Ve |
|---|---|---|
| ana@demo.com | vendedora | solo sus clientes (Acme, Globex) |
| luis@demo.com | vendedor | solo sus clientes (Initech, Hooli, Stark) |
| admin@demo.com | administradora | todo el CRM |

Sin clave de API el CRM funciona igual; solo el chat del asistente no responde.

La primera vez que arranca con una base vacía, crea las tablas y carga los datos de ejemplo.
`npm run reset-db -- --confirmar` borra todo y vuelve a los datos de ejemplo (ojo: es la misma base que usa la app online).

## Online

- App: <https://agenda-inteligente-crm.onrender.com> (Render, se actualiza sola con cada cambio en `main`).
- Datos: Postgres en Supabase (proyecto `agenda-inteligente-crm`). Las tablas tienen RLS activado sin políticas,
  así que la API pública de Supabase no puede leerlas: solo la app, que entra con su propia conexión.

## Qué incluye

- **Inicio**: el resumen del día con las reglas del negocio de `CONTEXT.md` (tareas vencidas, de hoy y de los
  próximos 2 días, clientes calientes o en negociación sin actividad hace más de 3 días, oportunidades frenadas
  hace más de 14 días).
- **Ficha de cliente**: datos, contactos, oportunidades, tareas e historial de actividades, con el próximo paso
  sugerido según el estado del cliente (regla 3 de `CONTEXT.md`) y un botón para preguntarle al asistente.
- **Acciones rápidas**: completar tareas con un clic, registrar llamadas, reuniones, emails o visitas desde la ficha
  y avanzar oportunidades de etapa.
- **Embudo de ventas**: oportunidades por etapa, con totales y pronóstico ponderado; se mueven arrastrando o con flechas.
- **Equipo** (solo administrador): métricas y alertas de cada vendedor.
- **Clientes, Oportunidades, Tareas, Actividades y Contactos**: alta, edición, baja y búsqueda.
- **Asistente**: chat en tiempo real con las 5 tareas de `TASK.md`.

## Cómo se cumplen las reglas del diseño

| Regla | Cómo la aplica la app |
|---|---|
| El vendedor solo ve lo suyo | El servidor filtra cada consulta por usuario. Al asistente le llegan **solo** los datos que ese usuario puede ver, así que no puede revelar información de otro vendedor aunque se lo pidan. |
| No inventa datos (grounding) | Con cada mensaje, el asistente recibe una foto actualizada del CRM y se le indica que es su única fuente. |
| No modifica el CRM ni envía mensajes | El asistente no tiene ninguna herramienta para escribir datos ni enviar mensajes: solo puede leer y redactar borradores. |
| Cálculo correcto de días | El servidor calcula los días de atraso, sin actividad y sin cambio de etapa con la fecha de hoy. |
| Datos de prueba de `TESTING.md` | La base arranca con esos datos, con fechas relativas a hoy, para repetir los 7 casos de prueba con Ana. |

## Estructura

```
docs/            Diseño del asistente (instrucciones de Claude)
server.js        Servidor web y API
src/db.js        Conexión a Postgres y datos de ejemplo
src/esquema.sql  Tablas de la base de datos
src/crm.js       Datos del CRM con permisos y resumen del día
src/asistente.js Integración con Claude
public/          Interfaz web
```
