// js/screens/lesson.js — pantalla "Clase" (ruta `#/lesson/:id`), el corazón de
// la app: PLAN.md §7 "Flujo de una clase", los seis pasos.
//
// Cuatro estados dentro de la MISMA ruta, sin recargar: portada → teoría →
// ejercicios de uno en uno → resultados. Se cambia de estado intercambiando el
// contenido de un único nodo raíz, no navegando: el estado de la sesión (cola
// de fallos, aciertos a la primera, cronómetro) vive en memoria y una
// navegación real lo perdería.
//
// Lo común con examen y repaso está en `session.js`; aquí solo lo que es
// específico de una clase.
import { h } from '../ui.js';
import * as data from '../data.js';
import * as store from '../store.js';
import { asyncScreen, screenHeader, levelChip, emptyState, navigate, pct, formatDuration, formatDate } from './parts.js';
import {
  buildCtx, sessionShell, mountExerciseStep, familyBreakdown, scoreHeadline,
  statRow, resultActions, scrollToTop,
} from './session.js';

// Un ejercicio fallado vuelve al final de la cola "hasta acertarlo"
// (PLAN.md §7 punto 5), pero con un tope: si el JSON de contenido tuviera un
// `accept` mal escrito, sin tope la clase sería literalmente imposible de
// terminar. A la tercera se da por visto y se deja para el repaso espaciado.
const MAX_ATTEMPTS = 3;

export function render(params = {}) {
  const lessonId = params.id || '';
  const lang = String(lessonId).split('-')[0] || 'fr';

  return asyncScreen(
    'screen-lesson',
    async () => {
      const lesson = await data.loadLesson(lessonId);
      // El curso solo hace falta para adornos (bloque) y para "Siguiente
      // clase": si falla, la clase tiene que poder hacerse igualmente.
      const course = await data.loadCourse(lang).catch(() => null);
      return { lesson, course };
    },
    ({ lesson, course }) => buildLesson({ lesson, course, lessonId, lang }),
    { loadingText: 'Cargando la clase…' }
  );
}

/* ============================================================
   Markdown ligero (SPEC-DATOS §4.1)
   ============================================================ */

/**
 * Solo **negrita**, *cursiva*, `código` y saltos de línea.
 *
 * Se escapa el HTML ANTES de sustituir: el `body` viene de un JSON de
 * contenido generado por IA y no puede poder inyectar marcado en la página
 * (ni siquiera sin querer, con un `<` suelto en una explicación).
 */
export function mdLite(text) {
  const escaped = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return escaped
    // `código` primero: así un asterisco dentro de un literal no se interpreta.
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function mdParagraph(text, className = 'lesson-body selectable') {
  return h('p', { class: className, html: mdLite(text) }, []);
}

/* ============================================================
   Pantalla
   ============================================================ */

function buildLesson({ lesson, course, lessonId, lang }) {
  const root = h('div', { class: 'lesson-root' }, []);

  // Se lee el progreso ANTES de marcar el inicio, para que la portada pueda
  // enseñar el estado del intento anterior tal cual estaba.
  const previous = store.getProgress(lang).lessons[lessonId] || null;
  store.markLessonStarted(lang, lessonId);

  const meta = (course?.lessons || []).find((l) => l.id === lessonId) || null;
  const block = meta && course ? (course.blocks || []).find((b) => b.id === meta.block) : null;
  const nextLesson = findNextLesson(course, meta);

  const show = (node) => {
    root.innerHTML = '';
    if (node) root.appendChild(node);
    scrollToTop();
  };

  const goCover = () => show(buildCover());
  const goTheory = () => show(buildTheory());
  const goExercises = (list) => runExercises(list);

  /* ---------- a) Portada ---------- */

  function buildCover() {
    const objectives = (lesson.objectives || []).map((text) =>
      h('li', { class: 'lesson-objective selectable' }, [text])
    );

    const attemptCard = previous && (previous.attempts || 0) > 0
      ? h('div', { class: 'card lesson-previous' }, [
          h('div', { class: 'card__title' }, ['Ya has hecho esta clase']),
          statRow('Mejor nota', pct(previous.bestScore ?? 0)),
          statRow('Intentos', String(previous.attempts ?? 0)),
          formatDate(previous.lastAt) ? statRow('Última vez', formatDate(previous.lastAt)) : null,
        ])
      : null;

    // "Ir directo a los ejercicios" solo tiene sentido si la teoría ya se leyó
    // en un intento anterior (store la marca al completar la clase).
    const theoryRead = !!(previous?.sectionsRead || previous?.status === 'done');

    return h('div', { class: 'lesson-cover' }, [
      screenHeader({
        title: lesson.title,
        subtitle: meta?.subtitle || null,
        back: `#/course/${lang}`,
        backLabel: 'Curso',
      }),
      h('div', { class: 'lesson-cover__chips' }, [
        levelChip(lesson.level || meta?.level || 'A1'),
        block ? h('span', { class: 'chip' }, [block.name]) : null,
        h('span', { class: 'chip' }, [`${meta?.estimatedMinutes ?? 10} min`]),
        h('span', { class: 'chip' }, [`${(lesson.exercises || []).length} ejercicios`]),
      ]),
      attemptCard,
      objectives.length
        ? h('div', { class: 'card lesson-objectives' }, [
            h('div', { class: 'card__title' }, ['Al terminar sabrás…']),
            h('ul', {}, objectives),
          ])
        : null,
      h('div', { class: 'lesson-cover__actions' }, [
        h('button', { type: 'button', class: 'btn btn--primary btn--block', onClick: goTheory }, ['Empezar']),
        theoryRead
          ? h('button', {
              type: 'button',
              class: 'btn btn--secondary btn--block',
              onClick: () => goExercises(lesson.exercises || []),
            }, ['Ir directo a los ejercicios'])
          : null,
      ]),
    ]);
  }

  /* ---------- b) Teoría ---------- */

  function buildTheory() {
    const ctx = buildCtx(lang);
    const sections = (lesson.sections || []).map((section) => renderSection(section, ctx));
    const vocab = renderVocab(lesson.vocab || [], ctx);

    return h('div', { class: 'lesson-theory' }, [
      h('div', { class: 'lesson-theory__head' }, [
        h('button', { type: 'button', class: 'lesson-backlink', onClick: goCover }, ['‹ Portada']),
        h('h1', { class: 'lesson-theory__title' }, [lesson.title]),
      ]),
      ...sections,
      vocab,
      h('div', { class: 'session__bar' }, [
        h('div', { class: 'session__actions' }, [
          h('button', {
            type: 'button',
            class: 'btn btn--primary btn--block',
            onClick: () => {
              // Se ha llegado al final de la teoría: a partir de ahora la
              // portada puede ofrecer el atajo directo a los ejercicios.
              store.markSectionsRead(lang, lessonId);
              goExercises(lesson.exercises || []);
            },
          }, ['Empezar ejercicios']),
        ]),
      ]),
    ]);
  }

  /* ---------- c) Ejercicios ---------- */

  /**
   * `practice: true` es la sesión de "Repetir fallos": los mismos ejercicios
   * que ya se han contado una vez. No vuelve a registrar respuestas ni a
   * persistir nada — si lo hiciera, repetir la clase serviría para inflar la
   * precisión, que es justo lo que "la precisión mide el primer intento"
   * pretende evitar. Es práctica, y la pantalla de resultados lo dice.
   */
  function runExercises(exercises, { practice = false } = {}) {
    if (!exercises.length) {
      show(emptyState({ icon: '🤷', title: 'Esta clase no tiene ejercicios todavía.' }));
      return;
    }

    const startedAt = Date.now();
    // `plan` crece: los fallos se encolan al final (PLAN.md §7 punto 5).
    const plan = exercises.map((exercise) => ({ exercise, attempt: 1 }));
    const attemptsById = new Map();
    // Precisión = PRIMER intento. Un ejercicio repetido no vuelve a contar ni
    // en la nota ni en las estadísticas: si contase, bastaría con insistir.
    const firstAnswers = [];
    const scored = new Map(); // id → acierto a la primera
    let position = 0;
    let totalChecks = 0;
    let totalCorrect = 0;

    const shell = sessionShell({
      title: null,
      exitLabel: 'Salir',
      onExit: () => navigate(`#/course/${lang}`),
      confirmExit: {
        title: '¿Salir de la clase?',
        body: 'Perderás el progreso de esta sesión: los ejercicios que ya has hecho no se guardarán.',
        confirmLabel: 'Salir',
        cancelLabel: 'Seguir',
        danger: true,
      },
    });
    show(shell.el);

    const ctx = buildCtx(lang);

    function step() {
      if (position >= plan.length) {
        finish();
        return;
      }
      const item = plan[position];
      shell.setProgress(position + 1, plan.length, 'Ejercicios de la clase');

      mountExerciseStep(shell, item.exercise, ctx, {
        checkLabel: 'Comprobar',
        nextLabel: position + 1 >= plan.length ? 'Ver resultados' : 'Siguiente',
        onDone: (result, instance) => {
          handleResult(item, result, instance);
          position += 1;
          step();
        },
      });
    }

    function handleResult(item, result, instance) {
      const exercise = item.exercise;
      const id = exercise.id;
      const selfAssessed = !!instance.isSelfAssessed;
      const correct = !!result?.correct;

      totalChecks += 1;
      if (correct) totalCorrect += 1;

      if (item.attempt === 1) {
        if (!practice) {
          // En los autoevaluados (shadowing, speak_prompt) `correct` siempre es
          // true: lo que de verdad informa es la autoevaluación del usuario, y
          // eso es lo que se registra en las estadísticas por tag (un "me ha
          // costado" es una debilidad real). Para la NOTA no cuentan: PLAN.md §7.
          const statCorrect = selfAssessed ? result?.userAnswer !== 'costo' : correct;
          store.recordAnswer(lang, { type: exercise.type, tags: exercise.tags || [], correct: statCorrect });
        }

        if (!selfAssessed) {
          firstAnswers.push({ type: exercise.type, correct });
          scored.set(id, correct);
        }
      }

      const attempts = (attemptsById.get(id) || 0) + 1;
      attemptsById.set(id, attempts);

      // Los autoevaluados nunca se repiten: no hay fallo que corregir.
      if (!correct && !selfAssessed && attempts < MAX_ATTEMPTS) {
        plan.push({ exercise, attempt: attempts + 1 });
      }
    }

    function finish() {
      const durationMs = Date.now() - startedAt;
      const failedFirst = [...scored.entries()].filter(([, ok]) => !ok).map(([id]) => id);
      const failedExercises = exercises.filter((ex) => failedFirst.includes(ex.id));
      show(buildResults({
        firstAnswers,
        durationMs,
        totalChecks,
        totalCorrect,
        failedExercises,
        practice,
      }));
    }

    step();
  }

  /* ---------- d) Resultados ---------- */

  let alreadyPersisted = false;

  function buildResults({ firstAnswers, durationMs, totalChecks, totalCorrect, failedExercises, practice = false }) {
    const total = firstAnswers.length;
    const correct = firstAnswers.filter((a) => a.correct).length;
    const score = total > 0 ? correct / total : 1;
    const selfAssessedCount = practice ? 0 : (lesson.exercises || []).length - total;

    // Efectos persistentes SOLO aquí y SOLO una vez: las tarjetas del SRS
    // entran al completar la clase, no antes (PLAN.md §8).
    let newCards = 0;
    if (!alreadyPersisted && !practice) {
      alreadyPersisted = true;
      store.markLessonDone(lang, lessonId, { score, durationMs });
      const before = Object.keys(store.getSrsCards(lang).cards).length;
      const after = store.addSrsCardsForLesson(lang, lessonId, lesson.srsItems || []);
      newCards = Object.keys(after).length - before;
      store.addActivity({
        minutes: Math.max(1, Math.round(durationMs / 60000)),
        exercises: totalChecks,
        correct: totalCorrect,
        lang,
      });
    }

    const srsTotal = (lesson.srsItems || []).length;

    return h('div', { class: 'lesson-results' }, [
      h('h1', { class: 'lesson-results__title' }, [practice ? 'Fallos repasados' : 'Clase terminada']),
      scoreHeadline(score, {
        correct,
        total,
        caption: practice
          ? 'Repaso de fallos: no cuenta para la nota de la clase ni para las estadísticas.'
          : selfAssessedCount > 0
            ? `${selfAssessedCount} ejercicio${selfAssessedCount === 1 ? '' : 's'} oral${selfAssessedCount === 1 ? '' : 'es'} de autoevaluación no puntúa${selfAssessedCount === 1 ? '' : 'n'}.`
            : null,
      }),
      h('div', { class: 'card' }, [
        statRow('Tiempo', formatDuration(durationMs)),
        statRow('Respuestas dadas', String(totalChecks)),
        statRow('Aciertos a la primera', `${correct} de ${total}`),
      ]),
      h('div', { class: 'card' }, [
        h('div', { class: 'card__title' }, ['Por tipo de ejercicio']),
        familyBreakdown(firstAnswers) || h('p', { class: 'text-dim' }, ['Sin datos.']),
      ]),
      practice
        ? null
        : h('div', { class: 'card' }, [
            h('div', { class: 'card__title' }, ['Repaso espaciado']),
            h('p', { class: 'text-dim' }, [
              newCards > 0
                ? `${newCards} tarjeta${newCards === 1 ? '' : 's'} nueva${newCards === 1 ? '' : 's'} en tu mazo (${srsTotal} de esta clase en total).`
                : `Las ${srsTotal} tarjetas de esta clase ya estaban en tu mazo.`,
            ]),
          ]),
      resultActions([
        failedExercises.length
          ? {
              label: `Repetir fallos (${failedExercises.length})`,
              kind: 'primary',
              onClick: () => runExercises(failedExercises, { practice: true }),
            }
          : null,
        nextLesson
          ? { label: 'Siguiente clase', kind: failedExercises.length ? 'secondary' : 'primary', href: `#/lesson/${nextLesson.id}` }
          : null,
        { label: 'Volver al curso', kind: 'ghost', href: `#/course/${lang}` },
      ]),
    ]);
  }

  goCover();
  return root;
}

/** La clase con el `order` inmediatamente superior dentro de `course.json`. */
function findNextLesson(course, meta) {
  if (!course || !meta) return null;
  return (course.lessons || [])
    .filter((l) => Number(l.order) > Number(meta.order))
    .sort((a, b) => a.order - b.order)[0] || null;
}

/* ============================================================
   Secciones de teoría (SPEC-DATOS §4) — los seis tipos
   ============================================================ */

function sectionTitle(section) {
  return section.title ? h('h2', { class: 'lesson-section__title selectable' }, [section.title]) : null;
}

/**
 * Palabra/frase en idioma meta con su botón ▶.
 * `speakText` permite pronunciar algo distinto de lo que se lee: el campo
 * `speak` del vocabulario (SPEC-DATOS §5) existe justo para eso.
 */
function targetLine(ctx, text, { slow = false, className = 'lesson-target', speakText = null } = {}) {
  const toSpeak = speakText || text;
  return h('div', { class: 'lesson-target-row' }, [
    h('span', { class: `${className} selectable`, lang: ctx.lang }, [text]),
    audioBtn(ctx, toSpeak),
    slow ? audioBtn(ctx, toSpeak, true) : null,
  ]);
}

/** ▶ propio de la teoría: los renderers de ejercicio tienen el suyo en shared.js. */
function audioBtn(ctx, text, slow = false) {
  if (!text) return null;
  return h('button', {
    type: 'button',
    class: 'ex-audio-btn',
    'aria-label': slow ? `Escuchar más despacio: ${text}` : `Escuchar: ${text}`,
    onClick: () => { (slow ? ctx.speakSlow(text) : ctx.speak(text)); },
  }, [slow ? '🐢' : '▶']);
}

function renderSection(section, ctx) {
  switch (section.type) {
    case 'explanation': return renderExplanation(section, ctx);
    case 'table': return renderTable(section);
    case 'phonetics': return renderPhonetics(section, ctx);
    case 'contrast': return renderContrast(section);
    case 'culture': return renderCulture(section);
    case 'tip': return renderTip(section);
    default:
      // Un tipo desconocido no puede dejar la teoría en blanco: se muestra lo
      // que haya de texto y se sigue.
      return h('section', { class: 'card lesson-section' }, [
        sectionTitle(section),
        section.body ? mdParagraph(section.body) : null,
      ]);
  }
}

function renderExplanation(section, ctx) {
  return h('section', { class: 'card lesson-section lesson-section--explanation' }, [
    sectionTitle(section),
    section.body ? mdParagraph(section.body) : null,
    (section.examples || []).length
      ? h('ul', { class: 'lesson-examples' }, section.examples.map((ex) =>
          h('li', { class: 'lesson-example' }, [
            targetLine(ctx, ex.target),
            h('p', { class: 'lesson-example__es selectable' }, [ex.es]),
            ex.note ? h('p', { class: 'lesson-example__note selectable' }, [ex.note]) : null,
          ])
        ))
      : null,
  ]);
}

function renderTable(section) {
  const headers = section.headers || [];
  const rows = section.rows || [];
  // El scroll horizontal va DENTRO del envoltorio de la tabla: la página nunca
  // debe desbordar a 376 px (PLAN.md §4).
  // Una tabla más ancha que la pantalla se corta a media columna sin ninguna
  // pista de que hay más a la derecha: en un móvil eso es contenido invisible.
  // La clase `is-scrollable` (y el aviso) solo aparecen si de verdad desborda,
  // y el degradado del borde derecho se apaga al llegar al final.
  const wrap = h('div', { class: 'lesson-table-wrap' }, [
    h('table', { class: 'lesson-table selectable' }, [
        headers.length
          ? h('thead', {}, [h('tr', {}, headers.map((head) => h('th', { scope: 'col' }, [head])))])
          : null,
      h('tbody', {}, rows.map((row) =>
        h('tr', {}, row.map((cell, i) =>
          i === 0
            ? h('th', { scope: 'row' }, [cell])
            : h('td', {}, [cell])
        ))
      )),
    ]),
  ]);

  const hint = h('p', { class: 'lesson-table-hint', hidden: true }, ['Desliza la tabla para ver el resto →']);

  const sync = () => {
    const overflows = wrap.scrollWidth > wrap.clientWidth + 1;
    hint.hidden = !overflows;
    wrap.classList.toggle('is-scrollable', overflows);
    // Al llegar al final ya no hay nada más que insinuar: fuera el degradado.
    const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 1;
    wrap.classList.toggle('is-at-end', atEnd);
  };

  wrap.addEventListener('scroll', sync, { passive: true });
  // El nodo aún no está en el DOM: sin layout, clientWidth es 0 y todo daría
  // "no desborda". Se mide en el siguiente fotograma, ya montado.
  requestAnimationFrame(sync);

  return h('section', { class: 'card lesson-section lesson-section--table' }, [
    sectionTitle(section),
    wrap,
    hint,
    section.note ? h('p', { class: 'lesson-note selectable' }, [section.note]) : null,
  ]);
}

function renderPhonetics(section, ctx) {
  const settings = ctx.settings || {};
  return h('section', { class: 'card lesson-section lesson-section--phonetics' }, [
    h('div', { class: 'lesson-section__tag' }, ['Pronunciación']),
    sectionTitle(section),
    section.body ? mdParagraph(section.body) : null,
    h('ul', { class: 'lesson-drills' }, (section.drills || []).map((drill) =>
      h('li', { class: 'lesson-drill' }, [
        targetLine(ctx, drill.target, { slow: true }),
        settings.showIpa !== false && drill.ipa
          ? h('p', { class: 'fonetica-ipa selectable' }, [drill.ipa])
          : null,
        settings.showEsApprox !== false && drill.esApprox
          ? h('p', { class: 'fonetica-es selectable' }, [drill.esApprox])
          : null,
        drill.hint ? h('p', { class: 'lesson-drill__hint selectable' }, [drill.hint]) : null,
      ])
    )),
  ]);
}

function renderContrast(section) {
  return h('section', { class: 'card lesson-section lesson-section--contrast' }, [
    h('div', { class: 'lesson-section__tag lesson-section__tag--warn' }, ['Ojo con esto']),
    sectionTitle(section),
    h('ul', { class: 'lesson-contrast' }, (section.items || []).map((item) =>
      h('li', { class: 'lesson-contrast__item' }, [
        h('p', { class: 'lesson-contrast__wrong selectable' }, [
          h('span', { class: 'lesson-contrast__mark', 'aria-hidden': 'true' }, ['✗']),
          h('span', { class: 'lesson-contrast__sr' }, ['Incorrecto: ']),
          item.wrong,
        ]),
        h('p', { class: 'lesson-contrast__right selectable' }, [
          h('span', { class: 'lesson-contrast__mark', 'aria-hidden': 'true' }, ['✓']),
          h('span', { class: 'lesson-contrast__sr' }, ['Correcto: ']),
          item.right,
        ]),
        item.why ? h('p', { class: 'lesson-contrast__why selectable' }, [item.why]) : null,
      ])
    )),
  ]);
}

function renderCulture(section) {
  return h('section', { class: 'card lesson-section lesson-section--culture' }, [
    h('div', { class: 'lesson-section__tag' }, ['Nota cultural']),
    sectionTitle(section),
    section.body ? mdParagraph(section.body) : null,
  ]);
}

function renderTip(section) {
  return h('section', { class: 'card lesson-section lesson-section--tip' }, [
    h('div', { class: 'lesson-section__tag lesson-section__tag--accent' }, ['Truco']),
    sectionTitle(section),
    section.body ? mdParagraph(section.body) : null,
  ]);
}

/* ============================================================
   Vocabulario (SPEC-DATOS §5)
   ============================================================ */

const GENDER_LABEL = { m: 'masculino', f: 'femenino', n: 'neutro' };

function renderVocab(vocab, ctx) {
  if (!vocab.length) return null;
  const settings = ctx.settings || {};

  return h('section', { class: 'card lesson-section lesson-vocab' }, [
    h('h2', { class: 'lesson-section__title' }, ['Vocabulario de la clase']),
    h('ul', { class: 'lesson-vocab__list' }, vocab.map((item) =>
      h('li', { class: 'lesson-vocab__item' }, [
        h('div', { class: 'lesson-vocab__head' }, [
          // `speak` manda sobre `target` cuando existe (SPEC-DATOS §5): a veces
          // hay que pronunciar la palabra sin el artículo o desarrollada.
          targetLine(ctx, item.target, { className: 'lesson-vocab__target', speakText: item.speak }),
          item.gender
            ? h('span', { class: 'chip chip--accent lesson-vocab__gender' }, [item.gender])
            : null,
        ]),
        h('p', { class: 'lesson-vocab__es selectable' }, [item.es]),
        item.plural ? h('p', { class: 'lesson-vocab__plural selectable' }, ['plural: ', item.plural]) : null,
        settings.showIpa !== false && item.ipa
          ? h('p', { class: 'fonetica-ipa selectable' }, [item.ipa]) : null,
        settings.showEsApprox !== false && item.esApprox
          ? h('p', { class: 'fonetica-es selectable' }, [item.esApprox]) : null,
        item.example
          ? h('div', { class: 'lesson-vocab__example' }, [
              targetLine(ctx, item.example.target, { className: 'lesson-vocab__example-target' }),
              h('p', { class: 'lesson-vocab__example-es selectable' }, [item.example.es]),
            ])
          : null,
      ])
    )),
  ]);

}
