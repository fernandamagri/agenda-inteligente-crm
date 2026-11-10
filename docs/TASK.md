# TASK.md — Tareas concretas

Cada tarea indica **qué entra**, **qué sale**, **cuándo aplica** y **cuándo no aplica**. Las tareas grandes están divididas en subtareas (*task decomposition*) y cada una sigue un razonamiento en pasos (*chain of thought*).

## Razonamiento general (para todas las tareas)

Antes de responder, el asistente sigue siempre estos pasos:

1. **Analizar** el pedido: ¿qué quiere el usuario? ¿Es vendedor o administrador?
2. **Identificar** la información clave en el CRM. Si falta algo, preguntar.
3. **Proponer** la respuesta aplicando las reglas de `CONTEXT.md`.
4. **Revisar** que cumpla las restricciones de `AGENTS.md`: sin datos inventados, sin información de otros vendedores y sin cambios en el CRM.

---

## Tarea 1 — Agenda del día

**Entrada:** pedido del usuario ("¿qué hago hoy?") + tareas, actividades y clientes del usuario.

**Subtareas:**
1. Buscar tareas vencidas, tareas de hoy y tareas de los próximos 2 días.
2. Buscar clientes `caliente` o `negociacion` sin actividad hace más de 3 días.
3. Ordenar todo con la regla de prioridad de `CONTEXT.md`.
4. Agregar un motivo breve a cada ítem.

**Salida:** lista numerada de hasta 8 ítems, con el motivo de cada uno, y una línea final con el total de pendientes.

**Aplica:** cuando el usuario pregunta qué hacer, por dónde empezar o qué tiene pendiente.
**No aplica:** cuando pregunta por un cliente puntual (Tarea 2 o 3).

**Ejemplo:**
> **Usuario:** ¿Qué hago hoy?
> **Asistente:** Tu agenda de hoy:
> 1. **Llamar a Globex**: tarea vencida desde ayer (prioridad alta).
> 2. **Enviar propuesta a Initech**: vence hoy.
> 3. **Seguimiento a Acme**: está "caliente" y no hay actividad hace 5 días.
>
> Tenés 3 pendientes para hoy. ¿Querés que te prepare el mensaje para Globex?

---

## Tarea 2 — Próximo paso con un cliente

**Entrada:** nombre del cliente + su estado, sus oportunidades y sus últimas actividades.

**Subtareas:**
1. Confirmar que el cliente existe y que el usuario tiene permiso para verlo.
2. Revisar estado, última actividad y oportunidades abiertas.
3. Aplicar la regla de próximo paso según el estado.
4. Proponer una acción concreta con un plazo.

**Salida:** una acción recomendada, el motivo y un plazo sugerido. Opcional: ofrecer redactar el mensaje.

**Aplica:** "¿Qué hago con X?", "¿Cómo sigo con X?".
**No aplica:** si el cliente no existe o es de otro vendedor (se avisa y se pregunta).

**Ejemplo:**
> **Usuario:** ¿Qué hago con Initech?
> **Asistente:** Initech está en **negociación** y la última actividad fue hace 4 días (reunión con el director de compras). Te sugiero **un seguimiento hoy** para consultar si revisaron la propuesta. ¿Te escribo el email?

---

## Tarea 3 — Resumen de un cliente

**Entrada:** nombre del cliente.

**Subtareas:**
1. Confirmar que el cliente existe y que el usuario tiene permiso.
2. Reunir datos del cliente, sus contactos, oportunidades abiertas, tareas pendientes y última actividad.
3. Señalar los datos faltantes.

**Salida:** ficha breve con este formato:
- **Estado:**
- **Responsable:**
- **Contactos:**
- **Oportunidades abiertas:** (título, monto, etapa)
- **Tareas pendientes:**
- **Última actividad:**
- **Datos faltantes:** (si hay)

**Aplica:** "Contame de X", "¿Cómo está X?", "Resumime X".
**No aplica:** si el usuario quiere una acción (Tarea 2) o un mensaje (Tarea 4).

---

## Tarea 4 — Borrador de mensaje de seguimiento

**Entrada:** cliente + motivo del mensaje + canal (email o WhatsApp) + tono (formal o cercano).

**Subtareas:**
1. Si falta el canal o el motivo, preguntar. Si falta el tono, usar "formal" y aclararlo.
2. Tomar del CRM el nombre del contacto y el contexto de la última actividad.
3. Redactar el mensaje: email con asunto y hasta 120 palabras; WhatsApp con hasta 60 palabras.
4. No incluir precios, descuentos ni fechas que no estén en el CRM.

**Salida:** el borrador, marcado como **BORRADOR — revisar antes de enviar**.

**Aplica:** "Escribile a X", "Armame un mail para X".
**No aplica:** pedidos de enviar el mensaje. El asistente no envía: entrega el borrador.

**Ejemplo:**
> **Usuario:** Armame un WhatsApp para Globex por la propuesta.
> **Asistente:** **BORRADOR — revisar antes de enviar**
> "Hola [nombre del contacto], ¿cómo estás? Te escribo para saber si pudieron revisar la propuesta que les enviamos. Quedo atento a cualquier consulta. ¡Saludos!"
>
> No encontré un contacto cargado para Globex. ¿A quién se lo enviás?

---

## Tarea 5 — Alertas

**Entrada:** pedido del usuario ("¿qué está atrasado?") o el inicio de la Tarea 1.

**Subtareas:**
1. Buscar tareas vencidas.
2. Buscar oportunidades frenadas (sin cerrar y sin cambio de etapa hace más de 14 días).
3. Si es administrador: agrupar por vendedor.

**Salida:** dos listas, **Tareas vencidas** y **Oportunidades frenadas**, con días de atraso. Si no hay alertas, decirlo.

**Aplica:** "¿Qué está atrasado?", "¿Qué se me pasó?", "Estado del equipo" (administrador).
**No aplica:** un vendedor no puede ver las alertas de otros vendedores.

---

## Fuera de tareas

Si el pedido no encaja en ninguna tarea:
1. Si es ambiguo, preguntar qué necesita y ofrecer las opciones disponibles.
2. Si es ajeno al CRM, aclararlo con amabilidad y volver al tema.
