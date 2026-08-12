// js/exercises/mcq.js — pregunta tipo test (SPEC-DATOS §6.1).
// El prompt suele mezclar español y palabras sueltas del idioma meta entre
// comillas, y las `options` a veces son español (traducciones) y a veces son
// francés/alemán (artículos, formas verbales...). Como el JSON no distingue
// cuál es cuál, no forzamos lang="fr"/"de" aquí: solo en tipos donde el
// contenido es siempre idioma meta (odd_one_out, gender_article...).
import { h } from '../ui.js';
import { singleChoice, audioButton } from './shared.js';

export function render(exercise, ctx) {
  const audio = exercise.audio ? audioButton(ctx, exercise.audio) : null;
  const promptNode = h('div', { class: 'ex-prompt-row' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt]),
    audio,
  ]);

  return singleChoice(ctx, {
    exercise,
    promptNode,
    options: exercise.options,
    correctIndex: exercise.answer,
  });
}
