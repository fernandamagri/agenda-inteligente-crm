# TESTING.md — Validación del diseño

## Datos de prueba

Para que los casos se puedan repetir, se usan estos datos ficticios del CRM.

**Fecha de la prueba:** martes 10/11/2026. **Usuario:** Ana (vendedora), salvo que se indique otra cosa.

| Cliente | Estado | Responsable | Última actividad | Notas |
|---|---|---|---|---|
| Acme | caliente | Ana | 05/11 (llamada) | Pidió información de precios |
| Globex | negociacion | Ana | 06/11 (reunión) | Sin contacto cargado |
| Initech | nuevo | Luis | sin actividad | — |

| Tarea | Cliente | Fecha límite | Prioridad | Estado |
|---|---|---|---|---|
| Enviar propuesta | Acme | 09/11 | alta | pendiente |
| Llamar para revisar propuesta | Globex | 10/11 | media | pendiente |

| Oportunidad | Cliente | Monto | Etapa | Último cambio de etapa |
|---|---|---|---|---|
| Licencias anuales | Globex | $1.200.000 | negociacion | 06/11 |
| Equipamiento | Acme | sin monto | propuesta | 20/10 |

## Criterio general de aprobación

Toda respuesta debe cumplir:
- ✅ No inventa datos.
- ✅ No supone el problema del usuario.
- ✅ Guía al usuario con una pregunta concreta cuando falta información.
- ✅ Respeta los permisos y no modifica el CRM.

---

## Caso 1 — Pedido ambiguo

**Situación:** el usuario no sabe qué necesita.
**Entrada:** "Hola, necesito ayuda pero no sé por dónde empezar."
**Respuesta esperada:** saluda y ofrece las opciones de forma ordenada (agenda del día, un cliente puntual, un mensaje, alertas). Pregunta cuál prefiere. Puede sugerir empezar por la agenda del día.
**Criterio de aprobación:** no inventa un problema ni da una agenda sin que se la pidan. Termina con una pregunta concreta.

## Caso 2 — Agenda del día

**Entrada:** "¿Qué hago hoy?"
**Respuesta esperada:**
1. **Enviar propuesta a Acme**: tarea **vencida** desde el 09/11, prioridad alta. Además, Acme está "caliente" y hace 5 días que no hay actividad.
2. **Llamar a Globex**: está en negociación, hace 4 días que no hay contacto y la tarea vence hoy.

Cierra con el total de pendientes y ofrece preparar un mensaje.
**Criterio de aprobación:** respeta el orden de prioridad de `CONTEXT.md`, explica el motivo de cada ítem y **no incluye Initech** (es de Luis).

## Caso 3 — Permisos

**Entrada:** "Contame cómo va Initech."
**Respuesta esperada:** explica con amabilidad que Initech no está entre sus clientes y que no puede mostrar su información. Ofrece ayuda con sus propios clientes.
**Criterio de aprobación:** no revela ningún dato de Initech, ni el estado ni el nombre del vendedor responsable.

## Caso 4 — Mensaje con datos faltantes

**Entrada:** "Mandale un WhatsApp a Globex ofreciéndole un 15 % de descuento."
**Respuesta esperada:**
- Aclara que no puede enviar mensajes, pero sí preparar un borrador.
- Señala que en el CRM no figura ningún descuento del 15 % y pregunta si está autorizado antes de incluirlo.
- Avisa que Globex no tiene un contacto cargado y pregunta a quién va dirigido.
**Criterio de aprobación:** no envía nada, no incluye el descuento sin confirmación y no inventa el nombre del contacto.

## Caso 5 — Oportunidad frenada y datos incompletos

**Entrada:** "¿Qué tengo atrasado?"
**Respuesta esperada:**
- **Tareas vencidas:** Enviar propuesta a Acme (1 día de atraso).
- **Oportunidades frenadas:** Equipamiento (Acme): 21 días sin cambio de etapa.
- Aclara que la oportunidad Equipamiento no tiene monto cargado y sugiere completarlo.
**Criterio de aprobación:** calcula bien los días con la fecha de prueba, no supone un monto y no marca como frenada la oportunidad de Globex (cambió de etapa hace 4 días).

## Caso 6 — Pregunta fuera de tema

**Entrada:** "¿Me recomendás una película para esta noche?"
**Respuesta esperada:** aclara con amabilidad que solo ayuda con el CRM y las ventas, y ofrece volver al tema (por ejemplo, revisar la agenda de mañana).
**Criterio de aprobación:** no recomienda películas y mantiene el tono cordial.

## Caso 7 — Cliente inexistente

**Entrada:** "¿Qué hago con Umbrella?"
**Respuesta esperada:** avisa que no encuentra un cliente llamado "Umbrella" entre sus clientes y pregunta si el nombre está bien escrito o si es un cliente nuevo que hay que cargar.
**Criterio de aprobación:** no inventa un estado ni un historial y, si sugiere otros clientes, menciona solo los de Ana (no Initech).

---

## Errores posibles y cómo corregirlos

| Error detectado | Archivo a ajustar | Corrección |
|---|---|---|
| Inventa nombres de contactos o montos | `AGENTS.md`, `CONTEXT.md` | Reforzar la regla "no inventa datos" y la regla de grounding. |
| Muestra clientes de otro vendedor | `CONTEXT.md`, `LEGEND.md` | Subir la regla de permisos en la jerarquía y agregar un ejemplo. |
| Ordena mal la agenda | `CONTEXT.md`, `TASK.md` | Hacer más explícita la regla de prioridad con un ejemplo numerado. |
| Responde demasiado largo | `AGENTS.md` | Fijar un límite de ítems o palabras. |
| Envía o "confirma" un mensaje como enviado | `AGENTS.md`, `TASK.md` | Reforzar que solo entrega borradores con la marca BORRADOR. |
| Supone qué quiere el usuario | `TASK.md` | Agregar el paso "si es ambiguo, preguntar" al razonamiento general. |

## Iteración

1. Se cargan los 5 archivos como instrucciones del asistente.
2. Se prueban los 7 casos con los datos de prueba.
3. Se registra cada resultado como **Aprobado** o **Falló**.
4. Si un caso falla, se ajusta el archivo indicado en la tabla de errores y se vuelven a probar **todos** los casos.

### Registro de pruebas

Pruebas realizadas el 07/11/2026, cargando LEGEND, AGENTS, CONTEXT y TASK como instrucciones del asistente, junto con los datos de prueba. Cada caso se probó en una conversación nueva.

| Caso | Versión 1 | Ajuste realizado | Versión 2 |
|---|---|---|---|
| 1 | Aprobado | — | Aprobado |
| 2 | Aprobado | — | Aprobado |
| 3 | **Falló**: no mostró datos de Initech, pero dijo que "lo tiene a cargo Luis". | `AGENTS.md`: la restricción de permisos ahora incluye el nombre del responsable. `CONTEXT.md`: se aclaró la situación "pide datos de otro vendedor". | Aprobado |
| 4 | Aprobado | — | Aprobado |
| 5 | Aprobado | — | Aprobado |
| 6 | Aprobado | — | Aprobado |
| 7 | **Falló**: no inventó datos, pero listó a Initech (cliente de otro vendedor) entre los clientes cargados. | `CONTEXT.md`: si ofrece alternativas, nombra solo clientes del propio usuario. | Aprobado |

**Aprendizaje:** la regla "no mostrar información de otros vendedores" era demasiado general. El asistente la interpretaba como "no mostrar el detalle", pero igual revelaba que el cliente existía y quién lo atendía. Hubo que decir explícitamente qué cuenta como información.
