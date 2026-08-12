// js/screens/review.js — sesión de repaso espaciado (ruta `#/review`),
// PLAN.md §8. Repasa las tarjetas vencidas del idioma activo.
//
// Una tarjeta del SRS es solo estado (`ef`, `interval`, `due`…) bajo una clave
// `"<lessonId>::<itemId>"`: el CONTENIDO (target, es, esApprox) vive en el
// `srsItems[]` de la clase de origen. Por eso hay que cargar las clases: se
// agrupan las claves por lección y se carga cada una UNA sola vez.
//
// El contenido va a seguir cambiando durante las Fases 5 y 6, así que una
// tarjeta cuya clase ya no exista, o cuyo `srsItem` haya desaparecido, se
// descarta en silencio. Romper la sesión de repaso entera por una tarjeta
// huérfana sería el peor resultado posible.
import { h } from '../ui.js';
import * as data from '../data.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import * as grader from '../grader.js';
import {
  targetInput, audioButton, feedbackNode, setFeedback, diffNode,
} from '../exercises/shared.js';
import { asyncScreen, emptyState, navigate, formatDate, formatDuration, LANG_NAMES } from './parts.js';
import {
  buildCtx, sessionShell, watchCanCheck, statRow, resultActions, scrollToTop,
} from './session.js';

// Calificaciones de PLAN.md §8. `again` (q=0) devuelve la tarjeta a la sesión.
const GRADES = [
  { label: 'Otra vez', q: 0, kind: 'again' },
  { label: 'Difícil', q: 3, kind: 'hard' },
  { label: 'Bien', q: 4, kind: 'good' },
  { label: 'Fácil', q: 5, kind: 'easy' },
];

export function render() {
  const lang = store.getSettings().activeLang || 'fr';

  return asyncScreen(
    'screen-review',
    () => loadSession(lang),
    (session) => buildReview(session, lang),
    { loadingText: 'Preparando el repaso…' }
  );
}

/**
 * Resuelve las tarjetas vencidas a `[{ key, card, item, lessonId }]`.
 * `Promise.allSettled` y no `all`: si una clase no carga (404 tras renombrar
 * contenido, red caída con el resto en caché), sus tarjetas se descartan pero
 * la sesión sigue con las demás.
 */
async function loadSession(lang) {
  const all = store.getSrsCards(lang).cards;
  const due = srs.dueCards(all);

  if (!due.length) {
    return { cards: [], nextDue: nextDueDate(all), total: Object.keys(all).length };
  }

  const byLesson = new Map();
  for (const entry of due) {
    const lessonId = String(entry.key).split('::')[0];
    if (!byLesson.has(lessonId)) byLesson.set(lessonId, []);
    byLesson.get(lessonId).push(entry);
  }

  const lessonIds = [...byLesson.keys()];
  const results = await Promise.allSettled(lessonIds.map((id) => data.loadLesson(id)));

  const cards = [];
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return; // clase inexistente → se descarta
    const lesson = result.value;
    const items = new Map((lesson.srsItems || []).map((item) => [item.id, item]));
    for (const entry of byLesson.get(lessonIds[i])) {
      const itemId = String(entry.key).split('::')[1];
      const item = items.get(itemId);
      if (!item) continue; // el ítem ya no existe en la clase → se descarta
      cards.push({ key: entry.key, card: entry.card, item, lessonId: lessonIds[i] });
    }
  });

  return { cards, nextDue: nextDueDate(all), total: Object.keys(all).length };
}

/** Fecha de vencimiento más próxima entre todas las tarjetas (para el vacío). */
function nextDueDate(cards) {
  const dates = Object.values(cards).map((card) => card.due).filter(Boolean).sort();
  return dates[0] || null;
}

/* ============================================================
   Pantalla
   ============================================================ */

function buildReview(session, lang) {
  const root = h('div', { class: 'review-root' }, []);
  const show = (node) => {
    root.innerHTML = '';
    if (node) root.appendChild(node);
    scrollToTop();
  };

  if (!session.cards.length) {
    show(h('div', {}, [
      h('h1', { class: 'review-title' }, ['Repasar']),
      emptyState({
        icon: '✅',
        title: session.total
          ? 'No hay nada que repasar hoy'
          : 'Tu mazo de repaso está vacío',
        body: session.total
          ? `Tienes ${session.total} tarjeta${session.total === 1 ? '' : 's'} en ${LANG_NAMES[lang] || lang}. La próxima toca el ${formatDate(session.nextDue) || 'próximo día'}.`
          : 'Las tarjetas entran en el mazo al completar una clase. Haz una y vuelve por aquí.',
        action: h('a', { class: 'btn btn--primary tap-target', href: '#/' }, ['Ir a aprender']),
      }),
    ]));
    return root;
  }

  const startedAt = Date.now();
  const queue = session.cards.slice();
  const seenKeys = new Set();
  let position = 0;
  let reviewed = 0;
  let correct = 0;
  let againCount = 0;

  const ctx = buildCtx(lang);
  const shell = sessionShell({
    title: 'Repaso',
    exitLabel: 'Salir',
    onExit: () => navigate('#/'),
    confirmExit: {
      title: '¿Terminar el repaso?',
      body: 'Las tarjetas que ya has calificado se han guardado; las que falten seguirán vencidas.',
      confirmLabel: 'Terminar',
      cancelLabel: 'Seguir',
    },
  });
  show(shell.el);

  function step() {
    if (position >= queue.length) {
      finish();
      return;
    }
    const entry = queue[position];
    shell.setProgress(position + 1, queue.length, 'Tarjetas del repaso');
    seenKeys.add(entry.key);

    const view = buildCard(entry, ctx, {
      onResolved: (wasCorrect) => {
        if (wasCorrect) correct += 1;
        showGrades(entry);
      },
    });
    shell.setBody(view.el);
    shell.setActions(view.actions);
    view.mount(shell);
  }

  function showGrades(entry) {
    shell.setActions(
      h('div', { class: 'review-grades' }, GRADES.map((grade) =>
        h('button', {
          type: 'button',
          class: `btn review-grade review-grade--${grade.kind}`,
          onClick: () => applyGrade(entry, grade),
        }, [grade.label])
      ))
    );
  }

  function applyGrade(entry, grade) {
    const graded = srs.grade(entry.card, grade.q);
    store.saveSrsCard(lang, entry.key, graded);
    reviewed += 1;

    // q < 3 → la tarjeta vuelve a salir en la MISMA sesión (PLAN.md §8).
    // Se reencola con la tarjeta ya calificada: `reps` volvió a 0, así que
    // `pickFormat` la mostrará otra vez en el formato más fácil.
    if (grade.q < 3) {
      againCount += 1;
      queue.push({ ...entry, card: graded });
    }

    position += 1;
    step();
  }

  function finish() {
    const durationMs = Date.now() - startedAt;
    store.addActivity({
      minutes: Math.max(1, Math.round(durationMs / 60000)),
      exercises: reviewed,
      correct,
      lang,
    });

    show(h('div', { class: 'review-results' }, [
      h('h1', { class: 'lesson-results__title' }, ['Repaso terminado']),
      h('div', { class: 'card' }, [
        statRow('Tarjetas repasadas', String(reviewed)),
        statRow('Distintas', String(seenKeys.size)),
        statRow('Marcadas "otra vez"', String(againCount)),
        statRow('Tiempo', formatDuration(durationMs)),
      ]),
      h('p', { class: 'text-dim review-note' }, [
        'Las tarjetas que has marcado "otra vez" vuelven mañana; las demás, según su intervalo.',
      ]),
      resultActions([
        { label: 'Ir a aprender', kind: 'primary', href: '#/' },
        { label: 'Ver progreso', kind: 'ghost', href: '#/stats' },
      ]),
    ]));
  }

  step();
  return root;
}

/* ============================================================
   Los tres formatos de tarjeta (srs.pickFormat)
   ============================================================ */

/**
 * Construye la vista de una tarjeta según su formato.
 * Devuelve { el, actions, mount(shell) }: `actions` es lo que va en la barra
 * inferior antes de calificar; al resolver, la pantalla la sustituye por las
 * cuatro calificaciones.
 */
function buildCard(entry, ctx, { onResolved }) {
  const format = srs.pickFormat(entry.card);
  if (format === 'production') return productionCard(entry, ctx, onResolved);
  if (format === 'listening') return listeningCard(entry, ctx, onResolved);
  return recognitionCard(entry, ctx, onResolved);
}

function cardTag(text) {
  return h('div', { class: 'review-card__tag' }, [text]);
}

function solutionBlock(entry, ctx, { showTarget = true, showEs = true } = {}) {
  const item = entry.item;
  return h('div', { class: 'review-solution' }, [
    showTarget
      ? h('div', { class: 'review-solution__row' }, [
          h('span', { class: 'review-target selectable', lang: ctx.lang }, [item.target]),
          audioButton(ctx, item.target),
        ])
      : null,
    showEs ? h('p', { class: 'review-es selectable' }, [item.es]) : null,
    item.esApprox && ctx.settings?.showEsApprox !== false
      ? h('p', { class: 'fonetica-es selectable' }, [item.esApprox])
      : null,
  ]);
}

/** Reconocimiento: ves el idioma meta, dices el español. Autoevaluado. */
function recognitionCard(entry, ctx, onResolved) {
  const item = entry.item;
  const solution = solutionBlock(entry, ctx, { showTarget: false });
  solution.hidden = true;

  const el = h('div', { class: 'review-card' }, [
    cardTag('¿Qué significa?'),
    h('div', { class: 'review-card__main' }, [
      h('span', { class: 'review-target review-target--big selectable', lang: ctx.lang }, [item.target]),
      audioButton(ctx, item.target),
    ]),
    h('p', { class: 'text-dim review-card__hint' }, ['Dilo en español antes de descubrirlo.']),
    solution,
  ]);

  const revealBtn = h('button', {
    type: 'button',
    class: 'btn btn--primary btn--block',
    onClick: () => {
      solution.hidden = false;
      revealBtn.disabled = true;
      // El reconocimiento no se corrige: cuenta como acierto en la actividad
      // del día y es la calificación del usuario la que lo matiza.
      onResolved(true);
    },
  }, ['Ver respuesta']);

  return { el, actions: revealBtn, mount: () => {} };
}

/** Producción: ves el español, escribes el idioma meta. Corregido con grader. */
function productionCard(entry, ctx, onResolved) {
  const item = entry.item;
  let value = '';
  const feedback = feedbackNode();
  const solution = solutionBlock(entry, ctx, { showEs: false });
  solution.hidden = true;

  const { input, wrap } = targetInput(ctx, {
    placeholder: 'Escríbelo…',
    onInput: (v) => { value = v; },
    ariaLabel: `Traduce al ${ctx.lang === 'fr' ? 'francés' : 'alemán'}: ${item.es}`,
  });

  const el = h('div', { class: 'review-card' }, [
    cardTag('Escríbelo en el idioma'),
    h('div', { class: 'review-card__main' }, [
      h('span', { class: 'review-es review-es--big selectable' }, [item.es]),
    ]),
    wrap,
    feedback,
    solution,
  ]);

  const checkBtn = h('button', { type: 'button', class: 'btn btn--primary btn--block' }, ['Comprobar']);

  const mount = (shell) => {
    // Mismo problema que en la clase: el botón solo puede habilitarse al
    // teclear, así que hay que escuchar `input` además de `click`.
    const stop = watchCanCheck(() => { checkBtn.disabled = value.trim() === ''; });
    shell.onCleanup(stop);

    checkBtn.addEventListener('click', () => {
      stop();
      // `strictAccents: false`: en el repaso interesa recordar la palabra, no
      // castigar una tilde; el grader devuelve 'accents' y se enseña la
      // grafía correcta igualmente.
      const result = grader.check(value, [item.target], { lang: ctx.lang, strictAccents: false });
      input.disabled = true;
      input.classList.add(result.result === 'fail' ? 'is-incorrect' : result.result === 'close' ? 'is-close' : 'is-correct');
      solution.hidden = false;
      setFeedback(feedback, {
        kind: result.result === 'fail' ? 'err' : result.result === 'close' ? 'warn' : 'ok',
        text: result.result === 'fail'
          ? 'No era eso.'
          : result.result === 'close'
            ? 'Casi: fíjate en lo resaltado.'
            : result.reason === 'accents' ? 'Correcto (cuidado con las tildes).' : 'Correcto.',
      });
      if (result.result !== 'fail' && result.result !== 'ok') {
        feedback.appendChild(h('div', { class: 'review-diff', lang: ctx.lang }, [diffNode(value, item.target)]));
      }
      onResolved(result.result !== 'fail');
    }, { once: true });
  };

  return { el, actions: checkBtn, mount };
}

/** Escucha: oyes el idioma meta y escribes lo que has oído. */
function listeningCard(entry, ctx, onResolved) {
  const item = entry.item;
  let value = '';
  const feedback = feedbackNode();
  const solution = solutionBlock(entry, ctx);
  solution.hidden = true;

  const { input, wrap } = targetInput(ctx, {
    placeholder: 'Escribe lo que oyes…',
    onInput: (v) => { value = v; },
    ariaLabel: 'Escribe lo que oyes',
  });

  const el = h('div', { class: 'review-card' }, [
    cardTag('Escucha y escribe'),
    h('div', { class: 'review-card__main review-card__main--audio' }, [
      audioButton(ctx, item.target),
      audioButton(ctx, item.target, { slow: true }),
    ]),
    h('p', { class: 'text-dim review-card__hint' }, ['Puedes escucharlo tantas veces como quieras.']),
    wrap,
    feedback,
    solution,
  ]);

  const checkBtn = h('button', { type: 'button', class: 'btn btn--primary btn--block' }, ['Comprobar']);

  const mount = (shell) => {
    const stop = watchCanCheck(() => { checkBtn.disabled = value.trim() === ''; });
    shell.onCleanup(stop);

    checkBtn.addEventListener('click', () => {
      stop();
      const result = grader.check(value, [item.target], { lang: ctx.lang, strictAccents: false });
      input.disabled = true;
      input.classList.add(result.result === 'fail' ? 'is-incorrect' : result.result === 'close' ? 'is-close' : 'is-correct');
      solution.hidden = false;
      setFeedback(feedback, {
        kind: result.result === 'fail' ? 'err' : result.result === 'close' ? 'warn' : 'ok',
        text: result.result === 'fail' ? 'No era eso.' : result.result === 'close' ? 'Casi.' : 'Correcto.',
      });
      onResolved(result.result !== 'fail');
    }, { once: true });
  };

  return { el, actions: checkBtn, mount };
}
