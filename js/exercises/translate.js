// js/exercises/translate.js — traducción en los dos sentidos
// (SPEC-DATOS §6.4 translate_to_target y §6.5 translate_to_es).
// Comparten toda la mecánica: un enunciado, un input libre y corrección
// tolerante contra la lista `accept`. Solo cambian el idioma del input, la
// severidad con las tildes y qué se enseña al fallar.
import { h } from '../ui.js';
import * as grader from '../grader.js';
import {
  feedbackNode, setFeedback, explainNode, showExplain,
  targetInput, esInput, audioButton, diffNode,
} from './shared.js';

function renderTranslate(exercise, ctx, { toTarget }) {
  let value = '';
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);
  // Hacia el idioma meta la ortografía importa y el ejercicio puede exigirla;
  // hacia el español nunca se penalizan las tildes (no es lo que se evalúa).
  const strictAccents = toTarget ? !!exercise.strictAccents : false;
  const graderLang = toTarget ? ctx.lang : 'es';

  let input;
  let inputBlock;
  if (toTarget) {
    const built = targetInput(ctx, { placeholder: 'Escribe tu traducción…', onInput: (v) => { value = v; }, ariaLabel: 'Tu traducción' });
    input = built.input;
    inputBlock = built.wrap;
  } else {
    input = esInput({ placeholder: 'Escribe tu traducción…', onInput: (v) => { value = v; }, ariaLabel: 'Tu traducción' });
    inputBlock = input;
  }

  // Hacia el español el enunciado ya está en el idioma meta: poder escucharlo
  // desde el principio forma parte del ejercicio. Hacia el idioma meta el
  // audio solo aparece después, con la solución (si no, la regalaría).
  const promptAudio = toTarget ? null : audioButton(ctx, exercise.speak || exercise.prompt);
  const solutionAudio = h('span', { class: 'ex-solution-audio', hidden: true }, []);

  const hints = h('div', { class: 'ex-hint', hidden: true }, []);

  const el = h('div', { class: 'ex ex-translate' }, [
    h('p', { class: 'ex-prompt-row' }, [
      h('span', { class: 'ex-prompt', lang: toTarget ? 'es' : ctx.lang }, [exercise.prompt]),
      promptAudio,
    ]),
    inputBlock,
    hints,
    feedback,
    solutionAudio,
    explain,
  ]);

  function showSolutionAudio(text) {
    solutionAudio.hidden = false;
    solutionAudio.innerHTML = '';
    const btn = audioButton(ctx, text, { label: 'Escuchar la solución' });
    if (btn) solutionAudio.appendChild(btn);
  }

  function finalize(r) {
    input.disabled = true;
    const expected = r.expected;

    if (r.result === 'ok' && r.reason === 'accents') {
      // Acierto, pero se ha perdonado alguna tilde: hay que enseñar la grafía
      // buena o el error se fosiliza.
      input.classList.add('is-correct');
      setFeedback(feedback, { kind: 'ok', text: h('span', {}, ['Correcto. Ojo a la ortografía exacta: ', h('strong', { lang: ctx.lang }, [expected])]) });
    } else if (r.result === 'ok') {
      input.classList.add('is-correct');
      setFeedback(feedback, { kind: 'ok', text: 'Correcto.' });
    } else if (r.result === 'close') {
      input.classList.add('is-close');
      const label = r.reason === 'accents' ? 'Casi: cuidado con las tildes. ' : 'Casi, por una errata. ';
      setFeedback(feedback, { kind: 'warn', text: h('span', {}, [label, 'La forma correcta es ', h('span', { lang: toTarget ? ctx.lang : 'es' }, [diffNode(value, expected)]), '.']) });
    } else {
      input.classList.add('is-incorrect');
      const accepts = Array.isArray(exercise.accept) ? exercise.accept : [exercise.accept];
      // Hacia el español las traducciones válidas suelen ser varias y muy
      // parecidas: enseñarlas todas evita la sensación de "esto también valía".
      const body = toTarget
        ? [h('span', { lang: ctx.lang }, [accepts[0]])]
        : accepts.map((a, i) => h('span', {}, [i ? ' · ' : '', a]));
      setFeedback(feedback, { kind: 'err', text: h('span', {}, ['Incorrecto. ', accepts.length > 1 && !toTarget ? 'Valían: ' : 'La respuesta correcta es ', ...body]) });

      if (toTarget && exercise.hintWords?.length) {
        hints.hidden = false;
        hints.textContent = `Pistas: ${exercise.hintWords.join(' · ')}`;
      }
    }

    if (toTarget) showSolutionAudio(exercise.speak || r.expected);
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const r = grader.check(value, exercise.accept, { lang: graderLang, strictAccents });
      finalize(r);
      result = {
        correct: r.result !== 'fail',
        close: r.result === 'close',
        reason: r.reason,
        userAnswer: value,
      };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      const expected = (Array.isArray(exercise.accept) ? exercise.accept : [exercise.accept])[0];
      input.value = expected;
      input.disabled = true;
      input.classList.add('is-correct');
      setFeedback(feedback, { kind: null, text: h('span', {}, ['Solución: ', h('span', { lang: toTarget ? ctx.lang : 'es' }, [expected])]) });
      if (toTarget) showSolutionAudio(exercise.speak || expected);
      showExplain(explain);
      // Revelar no puntúa: Result sin crédito para no romper la idempotencia
      // de check() si la pantalla lo llama después.
      result = { correct: false, close: false, reason: 'none', userAnswer: value };
    },
    focus: () => input.focus(),
    canCheck: () => value.trim() !== '',
    isSelfAssessed: false,
  };
}

export function renderToTarget(exercise, ctx) {
  return renderTranslate(exercise, ctx, { toTarget: true });
}

export function renderToEs(exercise, ctx) {
  return renderTranslate(exercise, ctx, { toTarget: false });
}
