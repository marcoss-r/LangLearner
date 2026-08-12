// js/exercises/shadowing.js — escuchar y repetir en voz alta (SPEC-DATOS §6.10).
//
// No hay corrección automática de pronunciación: el reconocimiento de voz no
// funciona en una PWA instalada en iOS (PLAN.md §2). El ejercicio se apoya en
// la autoevaluación honesta, que es como funcionan los métodos de shadowing de
// toda la vida. No puntúa la nota de la clase: `isSelfAssessed` lo indica y la
// pantalla de clase lo excluye del cómputo.
import { h } from '../ui.js';
import {
  explainNode, showExplain, audioButton, selfAssessRow,
} from './shared.js';

export function render(exercise, ctx) {
  let checked = false;
  let result = null;

  const explain = explainNode(exercise);

  // La guía de pronunciación se descubre DESPUÉS de intentarlo: si se ve desde
  // el principio, se lee en vez de escuchar.
  const guide = h('div', { class: 'ex-shadow-guide', hidden: true }, [
    exercise.esApprox ? h('p', { class: 'ex-shadow-approx selectable' }, [exercise.esApprox]) : null,
    exercise.ipa ? h('p', { class: 'fonetica-ipa selectable' }, [exercise.ipa]) : null,
    exercise.focus ? h('p', { class: 'ex-shadow-focus selectable' }, [exercise.focus]) : null,
  ]);

  const assess = selfAssessRow(() => {
    if (ctx.onSelfAssessed) ctx.onSelfAssessed();
  });

  const saidBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--secondary btn--block',
      onClick: () => {
        if (checked) return;
        guide.hidden = false;
        assess.row.hidden = false;
        saidBtn.hidden = true;
      },
    },
    ['Ya lo he dicho en voz alta']
  );

  const el = h('div', { class: 'ex ex-shadowing' }, [
    h('p', { class: 'ex-prompt' }, ['Escucha, y repítelo en voz alta imitando el ritmo.']),
    h('div', { class: 'ex-shadow-line' }, [
      h('p', { class: 'ex-shadow-target selectable', lang: ctx.lang }, [exercise.speak]),
      audioButton(ctx, exercise.speak),
      audioButton(ctx, exercise.speak, { slow: true }),
    ]),
    exercise.es ? h('p', { class: 'ex-shadow-es selectable' }, [exercise.es]) : null,
    saidBtn,
    guide,
    assess.row,
    explain,
  ]);

  function finalize() {
    guide.hidden = false;
    assess.row.hidden = false;
    assess.disable();
    saidBtn.hidden = true;
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      finalize();
      // Siempre `correct: true`: no se está evaluando nada, solo registrando la
      // autoevaluación para que el SRS sepa si la frase costó o no.
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
    focus: () => saidBtn.focus(),
    canCheck: () => assess.getValue() != null,
    isSelfAssessed: true,
  };
}
