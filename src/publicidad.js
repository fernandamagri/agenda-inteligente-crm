// Publicidad en Mercado Libre (Product Ads de SBHOGAR): cómo se consume el presupuesto de cada
// campaña y qué ROAS y presupuesto recomienda la metodología DomUP. Solo lectura.
//
// Los datos los escribe ml-stock-sync cada hora en la tabla ads_presupuesto_horario (misma base
// de Supabase), disparado por pg_cron. Este módulo no toca Mercado Libre.
import { todos } from './db.js';
import { ErrorCRM } from './crm.js';

// Se considera que la campaña "se cortó" cuando consumió este % de su presupuesto diario.
const UMBRAL_CORTE = 95;

// Recomendación según la metodología DomUP (3 cajones). Se busca por el nombre de la campaña.
// Para cambiarla, editar esta lista.
export const RECOMENDACIONES = [
  {
    clave: 'recomendados',
    rol: 'Ganadores (Top)',
    roasSugerido: 6.5,
    pasoIntermedio: 15,
    presupuestoSugerido: 2300,
    porque:
      'Es donde van los anuncios que venden y la que debe llevar la mayor inversión. Bajar el ROAS de a poco (25x → 15x → 6,5x) y subir el presupuesto 20% por semana si sigue rentable.',
  },
  {
    clave: 'base',
    rol: 'Laboratorio',
    roasSugerido: 12.5,
    pasoIntermedio: null,
    presupuestoSugerido: 1000,
    porque:
      'Prueba lo nuevo y lo que no tiene datos. Si gasta sin vender ("topeada roja"), no se le pone más plata: se revisan sus anuncios.',
  },
  {
    clave: 'reserva',
    rol: 'Freezer',
    roasSugerido: 35,
    pasoIntermedio: null,
    presupuestoSugerido: 900,
    porque:
      'Enfría los anuncios que gastan sin vender o con poco stock. Va con ROAS 35x y el presupuesto mínimo del país ($900), sin ajuste automático.',
  },
];

function recomendacionPara(nombre) {
  const n = String(nombre ?? '').toLowerCase();
  return RECOMENDACIONES.find((r) => n.includes(r.clave)) ?? null;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

export async function resumenPublicidad(usuario, { dias = 7 } = {}) {
  if (usuario.rol !== 'admin') throw new ErrorCRM('Solo el administrador puede ver la publicidad.', 403);
  const d = Math.min(Math.max(Number(dias) || 7, 1), 31);

  let filas;
  try {
    filas = await todos(
      `WITH hoy AS (SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d),
       ultima AS (
         SELECT DISTINCT ON (fecha_ar, campaign_id)
                fecha_ar, campaign_id, campana, presupuesto_diario, gasto_hoy, pct_consumido,
                ingresos_hoy, clics_hoy, hora_ar AS ultima_hora,
                (datos_crudos->>'roas_target')::numeric AS roas_objetivo
           FROM ads_presupuesto_horario, hoy
          WHERE estado = 'active' AND fecha_ar > hoy.d - :dias::int
          ORDER BY fecha_ar, campaign_id, registrado_en DESC),
       corte AS (
         SELECT fecha_ar, campaign_id, MIN(hora_ar) AS hora_corte
           FROM ads_presupuesto_horario, hoy
          WHERE estado = 'active' AND fecha_ar > hoy.d - :dias::int AND pct_consumido >= :umbral
          GROUP BY fecha_ar, campaign_id),
       registros AS (
         SELECT fecha_ar, campaign_id, COUNT(*)::int AS tomas
           FROM ads_presupuesto_horario, hoy
          WHERE estado = 'active' AND fecha_ar > hoy.d - :dias::int
          GROUP BY fecha_ar, campaign_id)
       SELECT to_char(u.fecha_ar, 'YYYY-MM-DD') AS fecha, u.campaign_id, u.campana, u.presupuesto_diario,
              u.gasto_hoy, u.pct_consumido, u.ingresos_hoy, u.clics_hoy, u.roas_objetivo,
              to_char(u.ultima_hora, 'HH24:MI') AS ultima_hora,
              to_char(c.hora_corte, 'HH24:MI') AS hora_corte, r.tomas,
              (SELECT d FROM hoy) = u.fecha_ar AS es_hoy
         FROM ultima u
         LEFT JOIN corte c USING (fecha_ar, campaign_id)
         LEFT JOIN registros r USING (fecha_ar, campaign_id)
        ORDER BY u.campana, u.fecha_ar DESC`,
      { dias: d, umbral: UMBRAL_CORTE }
    );
  } catch (e) {
    if (e.code === '42P01') {
      // La tabla todavía no existe en esta base.
      return { hayDatos: false, umbralCorte: UMBRAL_CORTE, dias: d, campanas: [], ultimoRegistro: null };
    }
    throw e;
  }

  const porCampana = new Map();
  for (const f of filas) {
    const dia = {
      fecha: f.fecha,
      esHoy: f.es_hoy,
      presupuesto: num(f.presupuesto_diario),
      gasto: num(f.gasto_hoy),
      pct: num(f.pct_consumido),
      ingresos: num(f.ingresos_hoy),
      clics: f.clics_hoy,
      horaCorte: f.hora_corte,
      ultimaHora: f.ultima_hora,
      tomas: f.tomas,
    };
    if (!porCampana.has(f.campaign_id)) {
      porCampana.set(f.campaign_id, {
        id: f.campaign_id,
        nombre: f.campana,
        roasObjetivoActual: num(f.roas_objetivo),
        presupuestoActual: num(f.presupuesto_diario),
        dias: [],
      });
    }
    porCampana.get(f.campaign_id).dias.push(dia);
  }

  const campanas = [...porCampana.values()].map((c) => {
    const gasto = c.dias.reduce((s, x) => s + (x.gasto ?? 0), 0);
    const ingresos = c.dias.reduce((s, x) => s + (x.ingresos ?? 0), 0);
    const cortes = c.dias.filter((x) => x.horaCorte && !x.esHoy);
    const diasCompletos = c.dias.filter((x) => !x.esHoy).length;
    return {
      ...c,
      hoy: c.dias.find((x) => x.esHoy) ?? null,
      gastoPeriodo: gasto,
      ingresosPeriodo: ingresos,
      roasReal: gasto > 0 ? ingresos / gasto : null,
      diasCortados: cortes.length,
      diasCompletos,
      recomendacion: recomendacionPara(c.nombre),
    };
  });

  const ultimo = filas.length
    ? filas.reduce((a, f) => (`${f.fecha} ${f.ultima_hora}` > a ? `${f.fecha} ${f.ultima_hora}` : a), '')
    : null;

  return { hayDatos: filas.length > 0, umbralCorte: UMBRAL_CORTE, dias: d, campanas, ultimoRegistro: ultimo };
}
