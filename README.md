# Agenda Inteligente · CRM

CRM de ventas con **Agenda Inteligente**, el asistente comercial diseñado en la carpeta [`docs/`](docs/).
El asistente funciona con Claude y usa como instrucciones los documentos `LEGEND.md`, `AGENTS.md`,
`CONTEXT.md` y `TASK.md`, tal cual están escritos.

## Cómo probarla

**App online:** <https://agenda-inteligente-crm.onrender.com>
(la primera visita puede tardar hasta un minuto: el servidor gratuito se "duerme" si nadie lo usa).

En la pantalla de ingreso hay un botón para cada usuario de prueba. La contraseña de todos es `demo123`.

| Usuario | Rol | Qué probar |
|---|---|---|
| **Ana** · `ana@demo.com` | Vendedora | Que solo ve **sus** clientes (entre ellos Acme y Globex): Initech y Hooli son de Luis y no aparecen. **Inicio** arma su día con las reglas de prioridad. En **Clientes → Acme**, la ficha muestra el próximo paso sugerido. Completar una tarea con un clic. Mover una oportunidad en el **Embudo**. |
| **Luis** · `luis@demo.com` | Vendedor | Lo mismo con su cartera (entre ellos Initech, Hooli y Stark): no ve nada de Ana. |
| **Carla** · `admin@demo.com` | Administradora | Ve todo el CRM. **Equipo**: métricas y alertas de cada vendedor. **Usuarios**: crear una cuenta (genera una contraseña temporal), restablecer contraseñas, desactivar y borrar cuentas. |

**Recuperar una contraseña:** creá un usuario como Carla, salí, tocá **"¿Olvidaste tu contraseña?"** con el email de ese
usuario y volvé a entrar como Carla: el pedido aparece en **Inicio** y en **Usuarios**. Al generar la contraseña temporal,
el usuario entra con ella y la app le pide elegir una propia. (Las cuentas de prueba tienen la contraseña fija y no
participan de este flujo.)

**Asistente (panel derecho):** tiene las sugerencias "¿Qué hago hoy?", "¿Qué tengo atrasado?", etc. Necesita crédito en la
API de Claude: sin crédito responde *"Por ahora no contamos con el asistente disponible"*, y el resto del CRM funciona igual.

**Sobre los casos de [`docs/TESTING.md`](docs/TESTING.md):** los datos de ejemplo de Ana son los de esa tabla, cargados el
10/11/2026. Los días ("vencida hace 1 día", "21 días sin cambio de etapa") se calculan con la fecha real, así que en
otro día los números avanzan; y como la base es compartida, también puede haber datos cargados durante las pruebas.

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

- App: <https://agenda-inteligente-crm.onrender.com> (Render). Cada cambio que se sube a la rama `main` de GitHub
  se publica solo en uno o dos minutos.
- Datos: Postgres en Supabase (proyecto `agenda-inteligente-crm`). Las tablas tienen RLS activado sin políticas,
  así que la API pública de Supabase no puede leerlas: solo la app, que entra con su propia conexión.

## Usuarios y contraseñas

- **Altas:** solo la administración crea cuentas, desde la pantalla **Usuarios**. Al crear una cuenta se genera una
  contraseña temporal (y un mensaje listo para mandar por WhatsApp); al ingresar, la persona tiene que elegir una propia.
- **¿Olvidaste tu contraseña?:** desde la pantalla de ingreso se deja un pedido. La administración lo ve con un aviso,
  genera una contraseña temporal y se la pasa a la persona. La respuesta es la misma exista o no el email, para no
  revelar qué cuentas hay.
- **Cambiar contraseña:** botón *Contraseña* arriba a la derecha. Mínimo 8 caracteres, con letras y números; se cierran
  las sesiones en otros dispositivos.
- **Desactivar:** una cuenta desactivada no puede ingresar y se cierran sus sesiones; sus datos quedan en el CRM.
  Siempre tiene que quedar al menos un administrador activo.
- **Seguridad:** contraseñas guardadas con scrypt; sesiones en la base (sobreviven a reinicios, duran 30 días, se guarda
  solo un hash del token); límite de intentos fallidos de ingreso.
- **Cuentas de prueba (@demo.com):** tienen la contraseña fija `demo123` y no se pueden cambiar ni restablecer, para que la
  demo siempre funcione.

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
src/claves.js    Contraseñas (hash y temporales)
src/sesiones.js  Sesiones e intentos de ingreso
src/usuarios.js  Cuentas, cambio y restablecimiento de contraseñas
src/esquema.sql  Tablas de la base de datos
src/crm.js       Datos del CRM con permisos y resumen del día
src/asistente.js Integración con Claude
public/          Interfaz web
```
