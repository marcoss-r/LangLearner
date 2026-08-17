// js/screens/exam.js — prueba de nivel (ruta `#/exam/:id`), SPEC-DATOS §9.
//
// Es la sesión de ejercicios de una clase menos la teoría y menos la
// corrección inmediata: aquí NO se corrige nada hasta entregar. Eso cambia dos
// cosas respecto a `lesson.js`:
//   - Se puede navegar adelante y atrás: las instancias de los ejercicios se
//     crean una vez y se conservan vivas, así el usuario recupera lo que ya
//     había respondido al volver sobre una pregunta.
//   - `check()` se llama en bloque al entregar, y de ahí sale el informe por
//     `tag` que exige la spec.
//
// Los ficheros de examen llegan en la Fase 6: hoy `data.loadExam()` responde
// 404. Eso NO es un error de la app y no debe pintarse como tal — ver
// `loadExamOrMissing`.
import { h, confirmDialog } from '../ui.js';
import * as data from '../data.js';
import * as store from '../store.js';
import { asyncScreen, emptyState, navigate, pct, formatDuration } from './parts.js';
import {
  buildCtx, sessionShell, watchCanCheck, familyBreakdown, scoreHeadline,
  statRow, resultActions, scrollToTop, withReportFooter,
} from './session.js';
import { renderExercise } from '../exercises/index.js';

export function render(params = {}) {
  const examId = params.id || '';
  const lang = String(examId).split('-')[0] || 'fr';

  return asyncScreen(
    'screen-exam',
    () => loadExamOrMissing(examId),
    (exam) => (exam ? buildExam(exam, examId, lang) : buildMissing(examId, lang)),
    { loadingText: 'Cargando la prueba…' }
  );
}

/**
 * Devuelve el examen o `null` si todavía no existe.
 *
 * Un 404 aquí es el estado NORMAL hasta la Fase 6, y merece un mensaje
 * honesto ("aún no está disponible"), no el bloque rojo de error de red que
 * `asyncScreen` pintaría si dejáramos propagar la excepción. Cualquier otro
 * fallo (JSON corrupto, red caída) sí se propaga: eso sí es un error.
 */
async function loadExamOrMissing(examId) {
  try {
    return await data.loadExam(examId);
  } catch (err) {
    if (/\b404\b/.test(err?.message || '')) return null;
    throw err;
  }
}

function buildMissing(examId, lang) {
  return h('div', {}, [
    h('h1', { class: 'exam-title' }, ['Prueba de nivel']),
    emptyState({
      icon: '🧪',
      title: 'Esta prueba de nivel aún no está disponible',
      body: `Las pruebas de nivel (${examId}) se escriben cuando el nivel tiene ya todas sus clases. Mientras tanto, sigue avanzando por el curso.`,
      action: h('a', { class: 'btn btn--primary tap-target', href: `#/course/${lang}` }, ['Ir al curso']),
    }),
  ]);
}

/* ============================================================
   Sesión de examen
   ============================================================ */

function buildExam(exam, examId, lang) {
  const root = h('div', { class: 'exam-root' }, []);
  const show = (node) => {
    root.innerHTML = '';
    if (node) root.appendChild(node);
    scrollToTop();
  };

  const exercises = exam.exercises || [];
  if (!exercises.length) {
    show(buildMissing(examId, lang));
    return root;
  }

  const startedAt = Date.now();
  const ctx = buildCtx(lang);
  // Instancias vivas por índice: es lo que permite ir y volver sin perder lo
  // respondido. Se crean perezosamente, no de golpe: 70 ejercicios montados a
  // la vez es mucho DOM para un iPhone.
  const instances = new Map();
  let position = 0;
  let submitted = false;

  const shell = sessionShell({
    title: exam.title || 'Prueba de nivel',
    exitLabel: 'Salir',
    onExit: () => navigate('#/'),
    confirmExit: {
      title: '¿Salir de la prueba?',
      body: 'Se perderán todas tus respuestas: la prueba no se guarda a medias.',
      confirmLabel: 'Salir',
      cancelLabel: 'Seguir',
      danger: true,
    },
  });
  show(shell.el);

  const instanceAt = (i) => {
    if (!instances.has(i)) instances.set(i, renderExercise(exercises[i], ctx));
    return instances.get(i);
  };

  function step() {
    const instance = instanceAt(position);
    const exercise = exercises[position];
    shell.setProgress(position + 1, exercises.length, 'Preguntas de la prueba');
    // Sin corrección inmediata (SPEC-DATOS §9) no hay `result.userAnswer`
    // todavía: el botón de reporte copia `tuRespuesta: null` mientras se
    // navega. `sourceLesson` es más útil aquí que `examId` para localizar qué
    // JSON de contenido corregir.
    shell.setBody(withReportFooter(instance.el, {
      sourceId: exercise.sourceLesson,
      exercise,
      getAnswer: () => null,
      extra: { examId },
    }));

    const prevBtn = h('button', {
      type: 'button',
      class: 'btn btn--secondary exam-nav__btn',
      onClick: () => { if (position > 0) { position -= 1; step(); } },
    }, ['‹ Anterior']);
    prevBtn.disabled = position === 0;

    const isLast = position === exercises.length - 1;
    const nextBtn = h('button', {
      type: 'button',
      class: 'btn btn--primary exam-nav__btn',
      onClick: () => {
        if (isLast) { reviewBeforeSubmit(); return; }
        position += 1;
        step();
      },
    }, [isLast ? 'Revisar y entregar' : 'Siguiente ›']);

    const status = h('p', { class: 'exam-status text-dim' }, ['']);
    // Sin corrección inmediata el botón "Siguiente" nunca se deshabilita (se
    // permite dejar preguntas en blanco), pero sí se avisa de si está
    // respondida: por eso hace falta el mismo watcher de click + input.
    const stop = watchCanCheck(() => {
      status.textContent = instance.canCheck() ? 'Respondida' : 'Sin responder';
      status.classList.toggle('exam-status--done', instance.canCheck());
    });
    shell.onCleanup(stop);

    shell.setActions([
      status,
      h('div', { class: 'exam-nav' }, [prevBtn, nextBtn]),
    ]);
  }

  /** Antes de entregar: cuadrícula con el estado de cada pregunta. */
  function reviewBeforeSubmit() {
    const pending = exercises
      .map((_, i) => i)
      .filter((i) => !(instances.has(i) && instances.get(i).canCheck()));

    const grid = h('div', { class: 'exam-grid' }, exercises.map((_, i) => {
      const done = instances.has(i) && instances.get(i).canCheck();
      return h('button', {
        type: 'button',
        class: `exam-grid__cell${done ? ' is-done' : ''}`,
        'aria-label': `Pregunta ${i + 1}, ${done ? 'respondida' : 'sin responder'}`,
        onClick: () => { position = i; step(); },
      }, [String(i + 1)]);
    }));

    shell.setProgress(exercises.length, exercises.length, 'Preguntas de la prueba');
    shell.setBody(h('div', { class: 'exam-review' }, [
      h('h2', {}, ['Antes de entregar']),
      h('p', { class: 'text-dim' }, [
        pending.length === 1
          ? 'Te queda 1 pregunta sin responder. Toca su número para volver a ella.'
          : pending.length
            ? `Te quedan ${pending.length} preguntas sin responder. Toca cualquier número para volver a ellas.`
            : 'Has respondido a todas las preguntas.',
      ]),
      grid,
    ]));
    shell.setActions([
      h('button', {
        type: 'button',
        class: 'btn btn--secondary btn--block',
        onClick: () => { position = pending[0] ?? 0; step(); },
      }, [pending.length ? 'Ir a la primera sin responder' : 'Revisar desde el principio']),
      h('button', {
        type: 'button',
        class: 'btn btn--primary btn--block',
        onClick: () => confirmSubmit(pending.length),
      }, ['Entregar']),
    ]);
  }

  async function confirmSubmit(pendingCount) {
    const ok = await confirmDialog({
      title: '¿Entregar la prueba?',
      body: pendingCount === 1
        ? 'Queda 1 pregunta sin responder y contará como fallo. No se puede volver atrás.'
        : pendingCount
          ? `Quedan ${pendingCount} preguntas sin responder y contarán como fallo. No se puede volver atrás.`
          : 'No podrás volver atrás una vez entregada.',
      confirmLabel: 'Entregar',
      cancelLabel: 'Cancelar',
    });
    if (ok) submit();
  }

  function submit() {
    if (submitted) return;
    submitted = true;

    const answers = [];
    const byTagAcc = new Map();

    exercises.forEach((exercise, i) => {
      const instance = instanceAt(i);
      // `check()` aquí cumple doble función: calcula el resultado y deja el
      // ejercicio pintado con su corrección para el informe de abajo.
      const result = instance.check();
      const correct = !!result?.correct;
      answers.push({ type: exercise.type, correct, exercise, instance, userAnswer: result?.userAnswer ?? null });

      store.recordAnswer(lang, { type: exercise.type, tags: exercise.tags || [], correct });

      for (const tag of exercise.tags || []) {
        const entry = byTagAcc.get(tag) || { correct: 0, total: 0 };
        entry.total += 1;
        if (correct) entry.correct += 1;
        byTagAcc.set(tag, entry);
      }
    });

    const total = answers.length;
    const correct = answers.filter((a) => a.correct).length;
    const score = total ? correct / total : 0;
    const byTag = {};
    for (const [tag, entry] of byTagAcc) byTag[tag] = entry.total ? entry.correct / entry.total : 0;

    const durationMs = Date.now() - startedAt;
    store.recordExam(lang, examId, { score, byTag });
    store.addActivity({
      minutes: Math.max(1, Math.round(durationMs / 60000)),
      exercises: total,
      correct,
      lang,
    });

    show(buildReport({ exam, examId, lang, answers, score, correct, total, byTag, durationMs }));
  }

  step();
  return root;
}

/* ============================================================
   Informe final
   ============================================================ */

function buildReport({ exam, examId, lang, answers, score, correct, total, byTag, durationMs }) {
  const passScore = Number(exam.passScore ?? 0.7);
  const passed = score >= passScore;

  const tagRows = Object.entries(byTag)
    .sort((a, b) => a[1] - b[1])
    .map(([tag, ratio]) =>
      h('div', { class: 'exam-tag-row' }, [
        h('span', { class: 'exam-tag-row__name' }, [tag]),
        h('span', { class: `exam-tag-row__value${ratio < 0.6 ? ' is-weak' : ''}` }, [pct(ratio)]),
      ])
    );

  // La corrección de cada ejercicio, con su `explain`, se guarda para el final
  // (SPEC-DATOS §9: los explain se muestran todos en el informe).
  const detail = h('div', { class: 'exam-detail', hidden: true }, answers.map((answer, i) =>
    h('div', { class: `exam-detail__item${answer.correct ? '' : ' is-wrong'}` }, [
      h('div', { class: 'exam-detail__head' }, [`${i + 1}. ${answer.correct ? '✓' : '✗'}`]),
      withReportFooter(answer.instance.el, {
        sourceId: answer.exercise.sourceLesson,
        exercise: answer.exercise,
        getAnswer: () => answer.userAnswer,
        extra: { examId },
      }),
    ])
  ));

  const toggle = h('button', {
    type: 'button',
    class: 'btn btn--secondary btn--block',
    onClick: () => {
      detail.hidden = !detail.hidden;
      toggle.textContent = detail.hidden ? 'Ver todas las respuestas' : 'Ocultar respuestas';
    },
  }, ['Ver todas las respuestas']);

  return h('div', { class: 'exam-report' }, [
    h('h1', { class: 'lesson-results__title' }, ['Prueba terminada']),
    scoreHeadline(score, {
      correct,
      total,
      caption: passed
        ? `Aprobado (mínimo ${pct(passScore)}).`
        : `No alcanza el mínimo de ${pct(passScore)}.`,
    }),
    h('div', { class: 'card' }, [
      statRow('Tiempo', formatDuration(durationMs)),
      statRow('Resultado', passed ? 'Aprobado' : 'Suspenso'),
    ]),
    h('div', { class: 'card' }, [
      h('div', { class: 'card__title' }, ['Por tipo de ejercicio']),
      familyBreakdown(answers) || h('p', { class: 'text-dim' }, ['Sin datos.']),
    ]),
    tagRows.length
      ? h('div', { class: 'card' }, [
          h('div', { class: 'card__title' }, ['Por competencia']),
          h('p', { class: 'text-dim exam-tag-note' }, ['De peor a mejor. En rojo, por debajo del 60 %.']),
          h('div', { class: 'exam-tags' }, tagRows),
        ])
      : null,
    toggle,
    detail,
    resultActions([
      { label: 'Volver al curso', kind: 'primary', href: `#/course/${lang}` },
      { label: 'Ver progreso', kind: 'ghost', href: '#/stats' },
    ]),
  ]);
}
