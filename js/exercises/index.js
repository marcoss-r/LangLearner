// js/exercises/index.js — registro tipo → renderer y despacho (Fase 2).
// Contrato de cada renderer (respétalo al milímetro, lo usa la pantalla de
// clase de la Fase 3): render(exercise, ctx) → { el, check, reveal, focus,
// canCheck, isSelfAssessed }. Ver docs/SPEC-DATOS.md §6 y §8.
import { h } from '../ui.js';

import { render as mcq } from './mcq.js';
import { render as trueFalse } from './trueFalse.js';
import { render as oddOneOut } from './oddOneOut.js';
import { render as genderArticle } from './genderArticle.js';
import { render as matchPairs } from './matchPairs.js';
import { render as categorize } from './categorize.js';
import { render as fillBlank } from './fillBlank.js';
import { render as wordOrder } from './wordOrder.js';
import { renderToTarget, renderToEs } from './translate.js';
import { render as conjugation } from './conjugation.js';
import { render as listening } from './listening.js';
import { render as shadowing } from './shadowing.js';
import { render as speakPrompt } from './speakPrompt.js';
import { render as dialogue } from './dialogue.js';
import { render as errorCorrection } from './errorCorrection.js';

/** Bloque de error visible pero que no lanza: un JSON malo no puede tumbar la clase entera. */
function errorRenderer(message) {
  const el = h('div', { class: 'ex ex-error' }, [h('p', {}, [message])]);
  const result = { correct: false, close: false, reason: 'none', userAnswer: null };
  return {
    el,
    check: () => result,
    reveal: () => {},
    focus: () => {},
    canCheck: () => false,
    isSelfAssessed: false,
  };
}

/** mapa tipo → render. Los 16 tipos de SPEC-DATOS §6 están implementados. */
export const RENDERERS = {
  mcq,
  true_false: trueFalse,
  odd_one_out: oddOneOut,
  gender_article: genderArticle,
  match_pairs: matchPairs,
  categorize,
  fill_blank: fillBlank,
  word_order: wordOrder,

  translate_to_target: renderToTarget,
  translate_to_es: renderToEs,
  conjugation,
  listening,
  shadowing,
  speak_prompt: speakPrompt,
  dialogue,
  error_correction: errorCorrection,
};

/**
 * Familia estadística de cada tipo (SPEC-DATOS §6, tabla de distribución).
 * `gender_article` y `categorize` son ejercicios de reconocimiento por toque
 * (no aparecen con nombre en la tabla, entran en la familia "Libre" de la
 * spec); `error_correction` es producción escrita (el usuario reconstruye la
 * frase correcta); `listening` se cuenta aquí como "escucha", su familia más
 * específica, aunque la tabla también la admite dentro de "comprensión".
 */
export const EXERCISE_FAMILIES = {
  mcq: 'reconocimiento',
  true_false: 'reconocimiento',
  odd_one_out: 'reconocimiento',
  match_pairs: 'reconocimiento',
  gender_article: 'reconocimiento',
  categorize: 'reconocimiento',

  translate_to_target: 'produccion',
  fill_blank: 'produccion',
  word_order: 'produccion',
  conjugation: 'produccion',
  error_correction: 'produccion',

  translate_to_es: 'comprension',
  dialogue: 'comprension',

  listening: 'escucha',

  shadowing: 'oral',
  speak_prompt: 'oral',
};

/**
 * Despacha por exercise.type. Si el tipo es desconocido o el renderer lanza,
 * devuelve un bloque de error visible en vez de propagar la excepción.
 */
export function renderExercise(exercise, ctx) {
  const renderer = RENDERERS[exercise?.type];
  if (!renderer) {
    return errorRenderer(`Ejercicio con tipo desconocido: "${exercise?.type ?? '(sin tipo)'}" (id: ${exercise?.id ?? '?'}).`);
  }
  try {
    return renderer(exercise, ctx);
  } catch (err) {
    return errorRenderer(`Error al renderizar el ejercicio "${exercise?.id ?? '?'}": ${err.message}`);
  }
}
