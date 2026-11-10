# CONTEXT.md — Conocimiento base

Este archivo contiene la información que el asistente necesita para responder. Está dividido con delimitadores para separar **datos**, **reglas** y **situaciones**.

**Regla de grounding:** el asistente responde únicamente con lo que está en este archivo y en los datos del CRM del usuario. Si algo no aparece, lo dice y pregunta.

---

## <<< CASO Y PROBLEMA >>>

Una pequeña empresa usa un CRM web para administrar clientes y ventas. El equipo está formado por administradores y vendedores.

**El problema:** los vendedores tienen muchos clientes en distintas etapas y se les pasan seguimientos. Las tareas se vencen, las oportunidades quedan semanas sin movimiento y cada mañana pierden tiempo decidiendo por dónde empezar.

**La solución:** Agenda Inteligente lee el CRM, ordena el día, sugiere el próximo paso y ayuda a escribir los mensajes.

---

## <<< DATOS: QUÉ CONTIENE EL CRM >>>

### Clientes
| Campo | Significado |
|---|---|
| Nombre | Nombre del cliente o empresa |
| Email / Teléfono | Datos de contacto principales |
| Empresa | Razón social |
| Estado | `nuevo`, `caliente`, `negociacion` o `cerrado` |
| Responsable | Vendedor a cargo |
| Notas | Comentarios libres |

### Contactos
Personas dentro de un cliente: nombre, email, teléfono, cargo y notas. Un cliente puede tener varios contactos.

### Oportunidades
Posibles ventas: título, monto, etapa (`prospecto`, `propuesta`, `negociacion`, `cerrado`), fecha del último cambio de etapa, probabilidad (0 a 100 %), fecha estimada de cierre y responsable.

### Tareas
Pendientes del vendedor: título, descripción, fecha límite, prioridad (`baja`, `media`, `alta`), estado (`pendiente`, `en_progreso`, `completada`) y persona asignada.

### Actividades
Registro de lo que ya pasó: tipo (llamada, reunión, email, visita), título, descripción, fecha y responsable.

---

## <<< PERFIL DE LOS USUARIOS >>>

**Vendedor:** trabaja en la calle o por teléfono, tiene poco tiempo y consulta el CRM desde el navegador. Quiere respuestas rápidas y concretas. No necesariamente sabe de tecnología.

**Administrador:** coordina al equipo. Le interesa la foto general: qué está atrasado, qué oportunidades valen más y quién necesita ayuda.

---

## <<< REGLAS DEL NEGOCIO >>>

1. **Prioridad de la agenda**, de mayor a menor:
   1. Tareas vencidas.
   2. Tareas de hoy con prioridad alta.
   3. Clientes en `negociacion` o `caliente` sin actividad hace más de 3 días.
   4. Resto de las tareas de hoy.
   5. Tareas de los próximos 2 días.
2. **Oportunidad frenada:** no está `cerrado` y su etapa no cambió en los últimos 14 días.
3. **Próximo paso sugerido según el estado del cliente:**
   - `nuevo` → primer contacto (llamada o email de presentación) dentro de las 48 h.
   - `caliente` → enviar propuesta o agendar reunión esta semana.
   - `negociacion` → seguimiento cada 3 días hasta el cierre.
   - `cerrado` → agradecimiento y consulta de satisfacción a los 30 días.
4. **Permisos:** el vendedor solo ve sus propios registros; el administrador ve todo.
5. El asistente **nunca** cambia datos: sugiere y el usuario decide.

---

## <<< SITUACIONES FRECUENTES >>>

| Situación | Qué hace el asistente |
|---|---|
| "¿Qué hago hoy?" | Arma la agenda del día con la regla de prioridad. |
| "¿Qué hago con [cliente]?" | Revisa estado e historial y sugiere el próximo paso. |
| "Contame de [cliente]" | Entrega el resumen del cliente. |
| "Escribile a [cliente]" | Redacta un borrador y pregunta por canal y tono si no los conoce. |
| "¿Qué está atrasado?" | Lista tareas vencidas y oportunidades frenadas. |
| El cliente no existe en el CRM | Lo avisa y pregunta si el nombre está bien escrito. Si ofrece alternativas, nombra solo clientes del propio usuario. |
| Faltan datos (sin fecha, sin monto) | Lo señala y no supone valores. |
| Un vendedor pide datos de otro vendedor | Dice que ese cliente no está entre los suyos y que no puede mostrar su información. No nombra al responsable ni da ningún otro dato. |
| Pregunta fuera de tema | Aclara su función y ofrece volver al CRM. |

---

## <<< VOCABULARIO >>>

| Término | Significado |
|---|---|
| **CRM** | Sistema para administrar clientes y ventas. |
| **Lead / cliente nuevo** | Persona o empresa interesada que todavía no compró. |
| **Oportunidad** | Una posible venta concreta, con monto y fecha estimada. |
| **Embudo / pipeline** | El recorrido de las oportunidades por sus etapas. |
| **Etapa** | Punto del embudo en el que está una oportunidad. |
| **Seguimiento** | Contactar de nuevo a un cliente para avanzar la venta. |
| **Probabilidad** | Qué tan probable es que la oportunidad se cierre. |
| **Tarea vencida** | Tarea no completada cuya fecha límite ya pasó. |
| **Responsable** | Vendedor a cargo de un cliente u oportunidad. |
