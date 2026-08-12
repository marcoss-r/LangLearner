// js/exercises/errorCorrection.js — encuentra el error y reescribe la frase
// entera (SPEC-DATOS §6.15). Tiene que quedar visualmente inequívoco que la
// frase de arriba está MAL: si se lee como un enunciado normal, el usuario la
// copia tal cual.
import { h } from '../ui.js';
import * as grader from '../grader.js';
import {
  feedbackNode, setFeedback, explainNode, showExplain,
  targetInput, audioButton, diffNode,
} from './shared.js';

export function render(exercise, ctx) {
  let value = '';
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);
  const strictAccents = !!exercise.strictAccents;

  const { input, wrap } = targetInput(ctx, {
    placeholder: 'Escribe la frase corregida entera…',
    onInput: (v) => { value = v; },
    ariaLabel: 'Frase corregida',
  });

  const solutionAudio = h('span', { class: 'ex-solution-audio', hidden: true }, []);

  const el = h('div', { class: 'ex ex-errorcorrection' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt || 'Hay un error. Corrige la frase entera.']),
    h('div', { class: 'ex-wrong' }, [
      h('span', { class: 'ex-wrong__badge' }, ['✗ incorrecta']),
      h('s', { class: 'ex-wrong__text selectable', lang: ctx.lang }, [exercise.wrong]),
    ]),
    wrap,
    feedback,
    solutionAudio,
    explain,
  ]);

  function showSolutionAudio(text) {
    const btn = audioButton(ctx, text, { label: 'Escuchar la frase correcta' });
    if (btn) {
      solutionAudio.hidden = false;
      solutionAudio.appendChild(btn);
    }
  }

  function finalize(r) {
    input.disabled = true;
    if (r.result === 'ok' && r.reason === 'accents') {
      input.classList.add('is-correct');
      setFeedback(feedback, { kind: 'ok', text: h('span', {}, ['Corregida. La grafía exacta es ', h('strong', { lang: ctx.lang }, [r.expected])]) });
    } else if (r.result === 'ok') {
      input.classList.add('is-correct');
      setFeedback(feedback, { kind: 'ok', text: 'Corregida.' });
    } else if (r.result === 'close') {
      input.classList.add('is-close');
      setFeedback(feedback, { kind: 'warn', text: h('span', {}, ['Casi. La frase correcta es ', h('span', { lang: ctx.lang }, [diffNode(value, r.expected)]), '.']) });
    } else {
      input.classList.add('is-incorrect');
      setFeedback(feedback, { kind: 'err', text: h('span', {}, ['No es eso. La frase correcta es ', h('span', { lang: ctx.lang }, [r.expected]), '.']) });
    }
    showSolutionAudio(r.expected);
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const r = grader.check(value, exercise.accept, { lang: ctx.lang, strictAccents });
      finalize(r);
      result = { correct: r.result !== 'fail', close: r.result === 'close', reason: r.reason, userAnswer: value };
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
      setFeedback(feedback, { kind: null, text: h('span', {}, ['Solución: ', h('span', { lang: ctx.lang }, [expected])]) });
      showSolutionAudio(expected);
      showExplain(explain);
      result = { correct: false, close: false, reason: 'none', userAnswer: value };
    },
    focus: () => input.focus(),
    canCheck: () => value.trim() !== '',
    isSelfAssessed: false,
  };
}
