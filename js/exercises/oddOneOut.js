// js/exercises/oddOneOut.js — el intruso (SPEC-DATOS §6.16).
// Aquí las `options` son siempre palabras del idioma meta (es el concepto del
// ejercicio: comparar varias palabras extranjeras y encontrar la que no
// encaja), así que sí se marca lang="fr"/"de".
import { h } from '../ui.js';
import { singleChoice } from './shared.js';

export function render(exercise, ctx) {
  const promptNode = h('p', { class: 'ex-prompt' }, [exercise.prompt]);

  return singleChoice(ctx, {
    exercise,
    promptNode,
    options: exercise.options,
    correctIndex: exercise.answer,
    optionLang: ctx.lang,
  });
}
