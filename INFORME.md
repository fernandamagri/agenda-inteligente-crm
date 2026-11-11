# Informe del proyecto · Agenda Inteligente CRM

**Autora:** María Fernanda Magri · **Fecha:** noviembre de 2026

**App online:** <https://agenda-inteligente-crm.onrender.com>
**Código:** <https://github.com/fernandamagri/agenda-inteligente-crm>

> La primera visita a la app puede tardar hasta un minuto: el servidor gratuito se "duerme" cuando nadie lo usa.

---

## 1. Resumen

El proyecto tiene dos partes:

1. **El diseño de un asistente con IA**, en la carpeta [`docs/`](docs/): *Agenda Inteligente*, un asistente comercial
   que trabaja dentro de un CRM de ventas. Ayuda a cada vendedor a organizar el día, a no perder seguimientos y a
   decidir el próximo paso con cada cliente.
2. **Una aplicación web real que pone ese diseño en funcionamiento**: un CRM completo (clientes, contactos,
   oportunidades, tareas y actividades) con el asistente integrado. El asistente usa **los documentos de `docs/` tal
   cual están escritos** como instrucciones del modelo de lenguaje (Claude).

La idea central: las reglas que el diseño le pide al asistente no quedan solo en el prompt. Las más importantes
también las garantiza el programa. Por ejemplo, el asistente no puede mostrarle a un vendedor los clientes de otro
porque **nunca recibe esos datos**, no solo porque se le pida que no lo haga.

---

## 2. Cómo evaluarla (recorrido sugerido, 10 minutos)

En la pantalla de ingreso hay un botón para cada usuario de prueba. La contraseña de todos es `demo123`.

| Usuario | Rol | Ve |
|---|---|---|
| **Ana** (`ana@demo.com`) | Vendedora | Solo sus clientes (entre ellos Acme y Globex) |
| **Luis** (`luis@demo.com`) | Vendedor | Solo sus clientes (entre ellos Initech, Hooli y Stark) |
| **Carla** (`admin@demo.com`) | Administradora | Todo el CRM, el equipo y los usuarios |

**Como Ana (vendedora):**

1. Al entrar aparece un **recordatorio de tareas vencidas** si tiene alguna.
2. **Inicio** muestra su día armado con la regla de prioridad de `CONTEXT.md`: tareas vencidas, de hoy y de los
   próximos 2 días, clientes "caliente" o "negociación" sin actividad hace más de 3 días y oportunidades frenadas
   (sin cambio de etapa hace más de 14 días). Más abajo hay **gráficos**.
3. En **Clientes**, abrir **Acme**: la ficha muestra el **próximo paso sugerido** según el estado del cliente
   (regla 3 de `CONTEXT.md`), sus contactos, oportunidades, tareas e historial.
4. Escribir **"Initech"** en la búsqueda de arriba (o Ctrl+K): no aparece nada, porque Initech es de Luis. Es la regla de
   permisos de `AGENTS.md` aplicada a toda la app.
5. **Embudo**: mover una oportunidad de etapa (arrastrando o con las flechas).
6. **Exportar a Excel** desde Clientes, Oportunidades, Tareas, Actividades o Contactos (o "Descargar todo en Excel" en
   Inicio): el archivo trae solo los datos de Ana.

**Como Carla (administradora):**

7. **Equipo**: métricas y alertas de cada vendedor (la Tarea 5 de `TASK.md` en versión administrador).
8. **Usuarios**: crear una cuenta (la app genera una contraseña temporal), restablecer contraseñas, desactivar y borrar
   cuentas, y descargar una **copia de seguridad**.
9. **Recuperar contraseña:** crear un usuario, salir, tocar **"¿Olvidaste tu contraseña?"** con ese email y volver a
   entrar como Carla: el pedido aparece en Inicio y en Usuarios.

**El asistente (panel derecho):** tiene sugerencias como "¿Qué hago hoy?" o "¿Qué tengo atrasado?". Ver la
[sección 7](#7-estado-actual-y-limitaciones) sobre su estado.

---

## 3. Del diseño a la aplicación

### 3.1 Los documentos de diseño

| Documento | Qué define | Cómo lo usa la app |
|---|---|---|
| [`LEGEND.md`](docs/LEGEND.md) | Mapa del proyecto y jerarquía de instrucciones | Parte de las instrucciones del asistente |
| [`AGENTS.md`](docs/AGENTS.md) | Rol, tono y restricciones (role prompting) | Parte de las instrucciones del asistente |
| [`CONTEXT.md`](docs/CONTEXT.md) | Datos del CRM, reglas del negocio, vocabulario (grounding) | Instrucciones del asistente **y** reglas programadas en el servidor |
| [`TASK.md`](docs/TASK.md) | Las 5 tareas, con entradas, salidas y ejemplos (few-shot, chain of thought) | Instrucciones del asistente |
| [`TESTING.md`](docs/TESTING.md) | Datos y casos de prueba | Datos de ejemplo con los que arranca la base. **No** se le pasa al asistente, porque contiene las respuestas esperadas |

### 3.2 Cómo se arma cada pregunta al asistente

```
Instrucciones fijas (system prompt)            Cada mensaje del usuario
┌──────────────────────────────────┐          ┌────────────────────────────────────────┐
│ Nota de integración con la app   │          │ <datos_crm>                            │
│ LEGEND.md                        │          │   fecha de hoy, usuario y rol          │
│ AGENTS.md                        │    +     │   clientes, contactos, oportunidades,  │
│ CONTEXT.md                       │          │   tareas y actividades QUE ESE USUARIO │
│ TASK.md                          │          │   PUEDE VER, con los días calculados   │
└──────────────────────────────────┘          │ </datos_crm>                           │
                                              │ "¿Qué hago hoy?"                       │
                                              └────────────────────────────────────────┘
```

- **Instrucciones fijas:** los cuatro documentos, sin modificar, más una nota que explica cómo llegan los datos. Como
  no cambian entre preguntas, se aprovecha el *caché de prompts* de la API (más rápido y más barato).
- **Datos en cada mensaje:** una "foto" actualizada del CRM, **ya filtrada por permisos** en el servidor. Si Ana
  pregunta por Initech, el asistente no tiene ningún dato de Initech para revelar.
- **Días precalculados:** el servidor agrega campos como `dias_de_atraso` o `dias_sin_cambio_de_etapa`. Los modelos de
  lenguaje se equivocan con facilidad al restar fechas; así no tienen que hacerlo.

### 3.3 Las reglas del diseño, una por una

| Regla del diseño | Dónde está | Cómo se cumple |
|---|---|---|
| El vendedor solo ve sus clientes, sin revelar ni el nombre del responsable de otro (`AGENTS.md` §7, `CONTEXT.md`) | Servidor (`src/crm.js`) | Cada consulta se filtra por usuario. Vale para pantallas, búsqueda, Excel y para los datos que recibe el asistente |
| No inventa datos (`AGENTS.md` §7, regla de grounding) | Instrucciones + datos | El asistente recibe el CRM real en cada mensaje y se le indica que es su única fuente |
| No modifica el CRM ni envía mensajes (`AGENTS.md` §7) | Diseño de la integración | El asistente no tiene herramientas para escribir ni enviar: solo lee y redacta borradores |
| Prioridad de la agenda (`CONTEXT.md`, regla 1) | Servidor + instrucciones | La pantalla Inicio aplica la regla; el asistente la aplica al responder |
| Oportunidad frenada: más de 14 días sin cambio de etapa (regla 2) | Servidor | La fecha de cambio de etapa se actualiza sola cuando cambia la etapa |
| Próximo paso según el estado del cliente (regla 3) | Servidor (ficha) + instrucciones | La ficha muestra la sugerencia; el asistente puede explicarla |
| El administrador ve todo y agrupa alertas por vendedor (Tarea 5) | Servidor | Pantalla Equipo, solo para administradores |

---

## 4. Funciones de la aplicación

- **CRM completo:** alta, edición, baja y listado de clientes, contactos, oportunidades, tareas y actividades.
- **Inicio:** resumen del día con las reglas del negocio y tres gráficos (monto por etapa, actividades por semana y,
  para la administración, monto abierto por vendedor). Cada gráfico tiene una vista de tabla.
- **Ficha de cliente** con el próximo paso sugerido y acciones rápidas (completar tareas, registrar llamadas o
  reuniones, avanzar oportunidades).
- **Embudo de ventas** con totales y pronóstico ponderado; las tarjetas se arrastran entre etapas.
- **Equipo** (administración): métricas y alertas por vendedor.
- **Búsqueda global** (Ctrl+K), sin importar acentos.
- **Exportar a Excel** cada sección o todo junto.
- **Recordatorio de tareas vencidas** al entrar.
- **Usuarios y contraseñas:** alta por la administración con contraseña temporal, "¿Olvidaste tu contraseña?",
  cambio de contraseña, desactivar y borrar cuentas.
- **Copias de seguridad:** descarga desde la app, comandos para guardar y restaurar (con un modo de prueba que no
  cambia nada) y una **copia automática todos los viernes a las 18:00**, programada en Windows. El plan gratuito de
  Supabase no hace copias propias.
- **Modo claro y oscuro**, y diseño adaptado al celular.
- **Asistente** en un panel lateral, con respuestas que aparecen a medida que se escriben.

---

## 5. Arquitectura

```
Navegador (HTML, CSS y JavaScript)
        │  HTTPS
        ▼
Servidor Node.js + Express  ── en Render (se publica solo con cada cambio en GitHub)
   ├─ Permisos por usuario en cada consulta
   ├─ Reglas del negocio (resumen del día, próximo paso, alertas)
   ├─ Búsqueda, Excel y copias de seguridad
   └─ Integración con la API de Claude ──► Claude (modelo claude-opus-5-5)
        │
        ▼
Base de datos Postgres ── en Supabase
```

| Pieza | Tecnología | Por qué |
|---|---|---|
| Servidor | Node.js 24 + Express 5 | Simple, y el SDK oficial de Claude es de JavaScript |
| Base de datos | Postgres en Supabase | Los datos se conservan aunque el servidor se reinicie; plan gratuito |
| Interfaz | HTML, CSS y JavaScript sin frameworks | Menos piezas que mantener; carga rápido |
| Publicación | Render, conectado a GitHub | Link fijo y actualización automática; plan gratuito |
| Asistente | API de Claude con el SDK oficial | Respuestas en tiempo real (streaming) y caché de prompts |

**Estructura de archivos:**

```
docs/              Diseño del asistente (instrucciones de Claude)
INFORME.md         Este informe
README.md          Instrucciones técnicas para ejecutarla
server.js          Servidor web: rutas y permisos de cada pedido
src/asistente.js   Integración con Claude (arma el prompt con docs/ y los datos del usuario)
src/crm.js         Datos del CRM con permisos, resumen del día, ficha y equipo
src/db.js          Conexión a Postgres y datos de ejemplo
src/esquema.sql    Tablas de la base de datos
src/usuarios.js    Cuentas y contraseñas
src/sesiones.js    Sesiones e intentos de ingreso
src/claves.js      Hash de contraseñas y contraseñas temporales
src/buscar.js      Búsqueda global
src/exportar.js    Exportación a Excel
src/copias.js      Copias de seguridad y restauración
public/            Interfaz web
```

---

## 6. Seguridad y privacidad

- **Permisos en el servidor**, no solo en la pantalla: aunque alguien modifique la página, el servidor no le entrega
  datos ajenos. Un vendedor que pide un registro de otro recibe "no se encontró entre tus datos", el mismo mensaje
  que si no existiera.
- **Contraseñas** guardadas con *scrypt* (nunca en texto). Las contraseñas temporales obligan a elegir una propia al
  entrar. Hay un límite de intentos fallidos de ingreso.
- **Sesiones** guardadas en la base: se guarda solo un hash del identificador, la cookie viaja solo por HTTPS y no es
  accesible desde JavaScript.
- **"¿Olvidaste tu contraseña?"** responde lo mismo exista o no el email, para no revelar qué cuentas hay.
- **Base de datos:** las tablas tienen RLS activado sin políticas, así que la API pública de Supabase no puede leerlas.
  Solo la app accede, con su propia conexión.
- **Cuentas de prueba:** tienen la contraseña fija `demo123` y no se pueden cambiar, desactivar ni borrar, para que la
  demo siempre funcione aunque alguien entre como administradora.

### 6.1 Mejoras de seguridad identificadas (no implementadas)

Antes de entregar se hizo una revisión de seguridad de la app publicada. Por ser un proyecto académico con datos de
prueba, estas mejoras quedan documentadas y **no se implementaron**. En un uso real con clientes reales, serían los
siguientes pasos, en este orden:

| Prioridad | Riesgo | Mejora propuesta |
|---|---|---|
| Alta | **Claves compartidas.** La clave de la API de Claude y la contraseña de la base viajan en el archivo `.env` de la entrega y se usaron durante el desarrollo. | Generar una clave de API y una contraseña de base nuevas, y poner un **límite de gasto mensual** en la consola de Anthropic. (El repositorio de GitHub no contiene ninguna clave: se verificó todo su historial.) |
| Alta | **La administradora de prueba es pública.** Cualquiera con el link puede entrar como Carla (`admin@demo.com`), descargar la copia de seguridad completa (con los hash de las contraseñas de todas las cuentas) y crear usuarios. | Que las cuentas de prueba no puedan descargar copias ni ver cuentas reales, y administrar la app con una cuenta propia. |
| Media | **Faltan cabeceras de seguridad HTTP.** No hay política de contenido (CSP), protección contra *clickjacking* ni HSTS, y el servidor anuncia que usa Express (`X-Powered-By`). | Agregar esas cabeceras (por ejemplo, con la librería *helmet*) y ocultar `X-Powered-By`. |
| Media | **Límites de uso solo en el ingreso.** El asistente, que cuesta dinero por cada pregunta, no tiene límite. | Limitar los pedidos por usuario, por ejemplo 50 preguntas al asistente por día. |
| Media | **Sin registro de auditoría.** No queda constancia de quién borró un registro, restableció una contraseña o descargó una copia. | Una tabla de auditoría ("quién hizo qué y cuándo") visible para la administración. |
| Baja | **La app se conecta a la base como superusuario.** | Un usuario de base con permisos solo sobre las tablas del CRM (principio de mínimo privilegio). |
| Baja | **Sesiones largas.** Duran 30 días aunque no se usen. | Cerrar la sesión tras un período de inactividad, por ejemplo 7 días. |
| Baja | **Dependencias.** Una librería podría tener una vulnerabilidad nueva sin que nadie se entere. | Activar Dependabot en GitHub para recibir avisos automáticos. |
| Baja | **Inyección de instrucciones al asistente.** Un texto en las notas de un cliente ("ignorá tus reglas…") llega al asistente. El impacto es bajo: el asistente no puede modificar nada y solo ve los datos de ese usuario. | Indicarle explícitamente que el contenido de `<datos_crm>` es información, nunca instrucciones. |
| Baja | **Un solo factor de autenticación.** | Verificación en dos pasos (código del celular) para los administradores. |

**Lo que ya está cubierto:** contraseñas con hash (*scrypt*), permisos verificados en el servidor, consultas a la base
siempre parametrizadas (sin inyección SQL), textos escapados antes de mostrarse (sin inyección de código en la página),
cookie de sesión segura, base de datos inaccesible desde afuera de la app y ninguna clave en el repositorio.

---

## 7. Estado actual y limitaciones

- **El asistente necesita crédito en la API de Claude.** La integración está completa y la clave está configurada,
  pero la cuenta todavía no tiene crédito. Mientras tanto, el chat responde *"Por ahora no contamos con el asistente
  disponible"* y el resto del CRM funciona normalmente. Por eso, el comportamiento del asistente dentro de la app
  **no pudo probarse todavía**. Las pruebas de los 7 casos registradas en [`TESTING.md`](docs/TESTING.md) se hicieron
  el 07/11/2026 cargando los documentos como instrucciones del asistente, antes de construir la app.
- **Los días de `TESTING.md` cambian con la fecha.** Los datos de ejemplo se cargaron el 10/11/2026 con esa tabla. Los
  días ("vencida hace 1 día", "21 días sin cambio de etapa") se calculan con la fecha real, así que en otro día los
  números avanzan. Además, la base es compartida y tiene datos cargados durante las pruebas de la app.
- **Plan gratuito:** el servidor se duerme si nadie lo usa (la primera visita tarda hasta un minuto) y Supabase pausa
  el proyecto si pasa una semana sin uso (se reactiva desde su panel).
- **Recordatorios:** se muestran dentro de la app al entrar; no se envían por email.

---

## 8. Qué se probó

Durante el desarrollo, cada función se probó contra la base real y en un navegador automatizado:

- **Permisos:** un vendedor no ve, busca, exporta ni modifica registros de otro; tampoco puede crear registros en
  clientes ajenos ni entrar a las pantallas de administración.
- **Reglas del negocio:** con los datos de `TESTING.md`, Inicio muestra lo esperado (Acme con 1 día de atraso,
  Equipamiento frenada, Globex no frenada).
- **Usuarios y contraseñas:** 24 casos (contraseña temporal, cambio obligatorio, contraseñas débiles, pedido de
  restablecimiento, cuentas desactivadas, límite de intentos, protección de las cuentas de prueba).
- **Datos persistentes:** los datos y las sesiones siguen después de reiniciar el servidor.
- **Copias de seguridad:** una copia real se restauró completa en modo de prueba, sin cambiar la base.
- **Pantallas:** en escritorio y celular, en modo claro y oscuro, sin errores en el navegador.

---

## 9. Próximos pasos posibles

1. Cargar crédito en la API y verificar los 7 casos de `TESTING.md` dentro de la app, de forma automática.
2. Un "modo sin IA" para que el asistente responda las tareas básicas con las reglas ya programadas.
3. Recordatorios por email y copias de seguridad automáticas diarias.
