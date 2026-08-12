// js/screens/stats.js — pantalla "Progreso" (#/stats), PLAN.md §9.
// Solo estadísticas reales: sin XP, sin medallas, sin racha. La lista de
// puntos débiles es la función más útil de la pantalla (PLAN §9) y va la
// primera, con el mejor tratamiento visual.
import { h, toast } from '../ui.js';
import * as data from '../data.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import {
  screenHeader,
  asyncScreen,
  progressBar,
  levelChip,
  pct,
  formatMinutes,
  formatDate,
  LANG_NAMES,
} from './parts.js';

// Nombres en español de los 16 tipos de ejercicio (SPEC-DATOS §6). No existe
// este mapa en ningún otro sitio del código: lo escribe esta pantalla porque
// es la única que necesita mostrar el tipo a un humano.
const TYPE_LABELS = {
  mcq: 'Opción múltiple',
  true_false: 'Verdadero o falso',
  odd_one_out: 'La palabra que no encaja',
  gender_article: 'Género y artículo',
  match_pairs: 'Emparejar',
  categorize: 'Clasificar',
  fill_blank: 'Rellenar huecos',
  word_order: 'Ordenar la frase',
  translate_to_target: 'Traducir al idioma',
  translate_to_es: 'Traducir al español',
  conjugation: 'Conjugación',
  listening: 'Comprensión auditiva',
  shadowing: 'Repetición (shadowing)',
  speak_prompt: 'Responder hablando',
  dialogue: 'Diálogo',
  error_correction: 'Corregir el error',
};

export function render() {
  const lang = store.getSettings().activeLang === 'de' ? 'de' : 'fr';
  return asyncScreen('screen-stats', () => data.loadCourse(lang), (course) => buildStats(lang, course), {
    loadingText: 'Cargando tus estadísticas…',
  });
}

function buildStats(lang, course) {
  const stats = store.getStats(lang);
  const progress = store.getProgress(lang);
  const activity = store.getActivity();
  const settings = store.getSettings();

  return [
    screenHeader({ title: 'Progreso', subtitle: LANG_NAMES[lang] }),
    weakTagsCard(course, stats),
    masteredCard(lang),
    coverageCard(lang, course),
    accuracyByTypeCard(stats),
    heatmapCard(activity),
    studyTimeCard(activity, settings),
    examsCard(progress),
  ];
}

function sectionEmpty(text) {
  return h('p', { class: 'text-dim stats-empty' }, [text]);
}

/* ---------- 1. Puntos débiles (prioridad máxima) ---------- */

function weakTagsCard(course, stats) {
  // store.getStats() devuelve los 5 peores tags ordenados de menor a mayor
  // acierto, sin ningún umbral. Con pocos tags registrados eso mete en la
  // lista temas que se dominan: un 94 % de acierto bajo el rótulo "los temas
  // donde más fallas" es sencillamente falso, y manda a repasar lo que ya se
  // sabe. Aquí se corta por debajo del 80 %.
  const WEAK_THRESHOLD = 0.8;
  const candidates = stats.weakestTags || [];
  const items = candidates.filter((it) => it.accuracy < WEAK_THRESHOLD);

  const card = h('section', { class: 'card stats-weak' }, [
    h('h2', { class: 'card__title' }, ['Tus puntos débiles']),
  ]);

  if (items.length === 0) {
    card.appendChild(
      sectionEmpty(
        candidates.length > 0
          ? 'Ahora mismo no fallas de forma sistemática en ningún tema: todos van por encima del 80 % de acierto.'
          : 'Responde al menos 5 ejercicios de un mismo tema (gramatical o de vocabulario) para que aparezca aquí.'
      )
    );
    return card;
  }

  const lessonsSorted = [...(course.lessons || [])].sort((a, b) => a.order - b.order);

  card.appendChild(h('p', { class: 'text-dim' }, ['Los temas donde más fallas. Empieza por aquí antes que por nada más.']));
  card.appendChild(
    h(
      'div',
      { class: 'row-list' },
      items.map((it, i) => {
        const lesson = lessonsSorted.find((l) => (l.tags || []).includes(it.tag));
        const scoreText = pct(it.accuracy);
        const kind = it.accuracy < 0.5 ? 'err' : it.accuracy < 0.75 ? 'warn' : 'ok';
        const inner = [
          h('span', { class: 'stats-weak__rank' }, [String(i + 1)]),
          h('div', { class: 'row__main' }, [
            h('div', { class: 'row__title' }, [it.tag]),
            h('div', { class: 'row__meta' }, [`${it.total} respuesta${it.total === 1 ? '' : 's'} registradas`]),
          ]),
          h('span', { class: `chip chip--${kind}` }, [scoreText]),
        ];
        return lesson
          ? h('a', { class: 'row stats-weak-row tap-target', href: `#/lesson/${lesson.id}` }, [
              ...inner,
              h('span', { 'aria-hidden': 'true' }, ['›']),
            ])
          : h('div', { class: 'row stats-weak-row' }, inner);
      })
    )
  );
  return card;
}

/* ---------- 2. Palabras dominadas ---------- */

function masteredCard(lang) {
  const cards = store.getSrsCards(lang).cards;
  const entries = Object.entries(cards);
  const total = entries.length;

  const card = h('section', { class: 'card' }, [h('h2', { class: 'card__title' }, ['Palabras dominadas'])]);

  if (total === 0) {
    card.appendChild(sectionEmpty('Todavía no tienes tarjetas de repaso: se generan al completar una clase.'));
    return card;
  }

  const mastered = entries.filter(([, c]) => (c.interval ?? 0) >= 21);
  const byLevel = { A1: 0, A2: 0, B1: 0 };
  const levelPattern = /^[a-z]{2}-(a1|a2|b1)-/i;
  for (const [key] of mastered) {
    const m = key.match(levelPattern);
    if (m) byLevel[m[1].toUpperCase()] += 1;
  }

  card.appendChild(h('p', { class: 'stats-big-number' }, [String(mastered.length)]));
  card.appendChild(h('p', { class: 'text-dim' }, [`de ${total} tarjeta${total === 1 ? '' : 's'} en total (repaso ≥ 21 días)`]));
  card.appendChild(progressBar(total > 0 ? mastered.length / total : 0, { label: 'Palabras dominadas' }));
  card.appendChild(
    h(
      'div',
      { class: 'stats-level-grid' },
      ['A1', 'A2', 'B1'].map((lv) =>
        h('div', { class: 'stats-level-grid__item' }, [
          h('div', { class: 'text-dim' }, [lv]),
          h('div', { class: 'stats-level-grid__value' }, [String(byLevel[lv])]),
        ])
      )
    )
  );
  return card;
}

/* ---------- 3. Cobertura del curso ---------- */

function coverageCard(lang, course) {
  const levels = course.levels || [];
  if (levels.length === 0) return null;

  const progress = store.getProgress(lang);
  const lessons = course.lessons || [];
  const doneByLevel = { A1: 0, A2: 0, B1: 0 };
  let totalDone = 0;
  for (const l of lessons) {
    if (progress.lessons[l.id]?.status === 'done') {
      doneByLevel[l.level] = (doneByLevel[l.level] || 0) + 1;
      totalDone += 1;
    }
  }
  const totalRange = levels[levels.length - 1].range[1];

  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Cobertura del curso']),
    h('p', { class: 'stats-big-number' }, [`${totalDone} / ${totalRange}`]),
    h('p', { class: 'text-dim' }, ['clases completadas']),
    h(
      'div',
      { class: 'stats-levels' },
      levels.map((lv) => {
        const total = lv.range[1] - lv.range[0] + 1;
        const done = doneByLevel[lv.id] || 0;
        return h('div', { class: 'home-level-row' }, [
          h('div', { class: 'home-level-row__head' }, [levelChip(lv.id), h('span', { class: 'text-dim' }, [`${done} / ${total}`])]),
          progressBar(total > 0 ? done / total : 0, { label: `Cobertura ${lv.id}` }),
        ]);
      })
    ),
  ]);
}

/* ---------- 4. Precisión por tipo de ejercicio ---------- */

function accuracyByTypeCard(stats) {
  const entries = Object.entries(stats.accuracyByType);
  const card = h('section', { class: 'card' }, [h('h2', { class: 'card__title' }, ['Precisión por tipo de ejercicio'])]);

  if (entries.length === 0) {
    card.appendChild(sectionEmpty('Responde ejercicios dentro de una clase para ver este desglose.'));
    return card;
  }

  entries.sort((a, b) => a[1] - b[1]);
  card.appendChild(
    h(
      'div',
      { class: 'stats-bars' },
      entries.map(([type, ratio]) =>
        h('div', { class: 'stats-bar-row' }, [
          h('div', { class: 'stats-bar-row__label' }, [TYPE_LABELS[type] || type]),
          progressBar(ratio, { label: TYPE_LABELS[type] || type, showValue: true }),
        ])
      )
    )
  );
  return card;
}

/* ---------- 5. Mapa de calor (últimas 12 semanas) ---------- */

function activityBucket(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < 10) return 1;
  if (minutes < 20) return 2;
  if (minutes < 40) return 3;
  return 4;
}

function heatmapCard(activity) {
  const todayStr = srs.todayKey();
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // lunes=0 ... domingo=6
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  const start = new Date(monday);
  start.setDate(monday.getDate() - 11 * 7);

  const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const weeks = [];
  let activeDays = 0;
  let totalMinutes = 0;

  for (let w = 0; w < 12; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = srs.todayKey(date);
      const isFuture = key > todayStr;
      const minutes = activity[key]?.minutes || 0;
      if (!isFuture && minutes > 0) activeDays += 1;
      if (!isFuture) totalMinutes += minutes;
      days.push({ key, date, minutes, isFuture, isToday: key === todayStr });
    }
    weeks.push(days);
  }

  const weeksNode = h(
    'div',
    { class: 'heatmap__weeks' },
    weeks.map((week) =>
      h(
        'div',
        { class: 'heatmap__week' },
        week.map((day) =>
          h('span', {
            class: `heatmap__cell heatmap__cell--${day.isFuture ? 'future' : 'b' + activityBucket(day.minutes)}${day.isToday ? ' is-today' : ''}`,
            title: `${day.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}: ${day.minutes} min`,
            onClick: day.isFuture
              ? null
              : () => toast(`${day.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}: ${formatMinutes(day.minutes)}`),
          })
        )
      )
    )
  );

  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Actividad de las últimas 12 semanas']),
    activeDays === 0
      ? sectionEmpty('Todavía no hay actividad registrada. Completa una clase para empezar a ver tu mapa.')
      : h('p', { class: 'text-dim' }, [`${activeDays} día${activeDays === 1 ? '' : 's'} activo${activeDays === 1 ? '' : 's'} · ${formatMinutes(totalMinutes)} en total`]),
    h('div', { class: 'heatmap' }, [
      h('div', { class: 'heatmap__labels' }, dayLabels.map((l) => h('span', {}, [l]))),
      weeksNode,
    ]),
    h('div', { class: 'heatmap__legend' }, [
      h('span', { class: 'text-dim' }, ['Menos']),
      ...[0, 1, 2, 3, 4].map((b) => h('span', { class: `heatmap__cell heatmap__cell--b${b}` })),
      h('span', { class: 'text-dim' }, ['Más']),
    ]),
  ]);
}

/* ---------- 6. Tiempo de estudio ---------- */

function studyTimeCard(activity, settings) {
  const todayKeyStr = srs.todayKey();
  const todayMinutes = activity[todayKeyStr]?.minutes || 0;
  const goal = settings.dailyGoalMin || 15;

  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  let weekMinutes = 0;
  for (let i = 0; i <= dow; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    weekMinutes += activity[srs.todayKey(d)]?.minutes || 0;
  }

  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Tiempo de estudio']),
    h('p', {}, [`Hoy: ${formatMinutes(todayMinutes)} de tu objetivo de ${formatMinutes(goal)}`]),
    progressBar(goal > 0 ? Math.min(1, todayMinutes / goal) : 0, { label: 'Progreso del objetivo diario de hoy' }),
    h('p', { class: 'text-dim' }, [`Esta semana llevas ${formatMinutes(weekMinutes)} de estudio.`]),
  ]);
}

/* ---------- 7. Notas de las pruebas de nivel ---------- */

function examsCard(progress) {
  const entries = Object.entries(progress.exams || {});
  const card = h('section', { class: 'card' }, [h('h2', { class: 'card__title' }, ['Pruebas de nivel'])]);

  if (entries.length === 0) {
    card.appendChild(sectionEmpty('Todavía no has hecho ninguna prueba de nivel.'));
    return card;
  }

  card.appendChild(
    h(
      'div',
      { class: 'row-list' },
      entries.map(([examId, ex]) => {
        const tagEntries = Object.entries(ex.byTag || {});
        return h('div', { class: 'stats-exam' }, [
          h('div', { class: 'stats-exam__head' }, [
            // "FR-A1" es el identificador interno del fichero; al usuario se le
            // enseña el nombre de la prueba, no la clave del JSON.
            h('span', { class: 'row__title' }, [`Prueba de nivel ${String(examId).split('-')[1]?.toUpperCase() || examId}`]),
            h('span', { class: `chip chip--${(ex.bestScore ?? 0) >= 0.7 ? 'ok' : 'warn'}` }, [pct(ex.bestScore ?? 0)]),
          ]),
          h('div', { class: 'text-dim' }, [
            `${ex.attempts} intento${ex.attempts === 1 ? '' : 's'} · última vez ${formatDate(ex.lastAt) || '—'}`,
          ]),
          tagEntries.length
            ? h(
                'div',
                { class: 'stats-exam__tags' },
                tagEntries.map(([tag, v]) => h('span', { class: 'chip' }, [`${tag}: ${pct(v)}`]))
              )
            : null,
        ]);
      })
    )
  );
  return card;
}
