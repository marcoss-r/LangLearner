// js/exercises/speakPrompt.js — producción oral guiada (SPEC-DATOS §6.11).
//
// El valor del ejercicio está en intentar decirlo ANTES de ver la solución:
// es recuperación activa, no reconocimiento. Por eso la interfaz insiste en
// ello y la solución vive detrás de un botón. Como shadowing, no puntúa.
import { h } from '../ui.js';
import {
  explainNode, showExplain, audioButton, selfAssessRow,
} from './shared.js';

export function render(exercise, ctx) {
  let checked = false;
  let result = null;

  const explain = explainNode(exercise);

  const alsoValid = exercise.alsoValid?.length
    ? h('div', { class: 'ex-speak-also' }, [
        h('p', { class: 'ex-hint-static' }, ['También vale:']),
        ...exercise.alsoValid.map((alt) =>
          h('p', { class: 'ex-speak-alt selectable', lang: ctx.lang }, [alt])
        ),
      ])
    : null;

  const solution = h('div', { class: 'ex-speak-solution', hidden: true }, [
    h('div', { class: 'ex-shadow-line' }, [
      h('p', { class: 'ex-speak-model selectable', lang: ctx.lang }, [exercise.modelAnswer]),
      audioButton(ctx, exercise.speak || exercise.modelAnswer),
      audioButton(ctx, exercise.speak || exercise.modelAnswer, { slow: true }),
    ]),
    alsoValid,
  ]);

  const assess = selfAssessRow(() => {
    if (ctx.onSelfAssessed) ctx.onSelfAssessed();
  });

  const revealBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--secondary btn--block',
      onClick: () => {
        if (checked) return;
        solution.hidden = false;
        assess.row.hidden = false;
        revealBtn.hidden = true;
        const p = ctx.speak(exercise.speak || exercise.modelAnswer);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      },
    },
    ['Revelar y escuchar']
  );

  const el = h('div', { class: 'ex ex-speak-prompt' }, [
    h('p', { class: 'ex-prompt selectable' }, [exercise.prompt]),
    h('p', { class: 'ex-hint-static' }, ['Dilo en voz alta antes de pulsar. Si miras la solución primero, el ejercicio no sirve de nada.']),
    revealBtn,
    solution,
    assess.row,
    explain,
  ]);

  function finalize() {
    solution.hidden = false;
    assess.row.hidden = false;
    assess.disable();
    revealBtn.hidden = true;
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      finalize();
      result = { correct: true, close: false, reason: 'exact', userAnswer: assess.getValue() };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      finalize();
      result = { correct: true, close: false, reason: 'exact', userAnswer: assess.getValue() };
    },
    focus: () => revealBtn.focus(),
    canCheck: () => assess.getValue() != null,
    isSelfAssessed: true,
  };
}
