// js/exercises/trueFalse.js — verdadero/falso (SPEC-DATOS §6.2).
import { h } from '../ui.js';
import { singleChoice } from './shared.js';

export function render(exercise, ctx) {
  const promptNode = h('p', { class: 'ex-prompt' }, [exercise.statement]);

  return singleChoice(ctx, {
    exercise,
    promptNode,
    options: ['Verdadero', 'Falso'],
    correctIndex: exercise.answer ? 0 : 1,
    // El Result debe llevar el booleano que respondió el usuario, no el
    // índice interno del botón.
    mapUserAnswer: (i) => (i == null ? null : i === 0),
  });
}
