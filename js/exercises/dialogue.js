// js/exercises/dialogue.js — completar los turnos que faltan de una
// conversación (SPEC-DATOS §6.14). Los turnos ya escritos se pueden escuchar;
// los turnos con `blank: true` son tuyos y hay que escribirlos.
import { h } from '../ui.js';
import * as grader from '../grader.js';
import {
  feedbackNode, setFeedback, explainNode, showExplain,
  targetInput, audioButton, diffNode,
} from './shared.js';

export function render(exercise, ctx) {
  const turns = exercise.turns || [];
  const blankIdx = []; // índices (en `turns`) de los turnos que hay que rellenar
  const values = [];
  const inputs = [];
  const corrections = [];

  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);
  const strictAccents = !!exercise.strictAccents;

  const turnNodes = turns.map((turn, ti) => {
    const who = h('span', { class: 'ex-dialogue__who' }, [turn.who]);

    if (!turn.blank) {
      return h('div', { class: 'ex-dialogue__turn' }, [
        who,
        h('span', { class: 'ex-dialogue__text selectable', lang: ctx.lang }, [turn.text]),
        turn.speak ? audioButton(ctx, turn.text) : null,
      ]);
    }

    const bi = blankIdx.length;
    blankIdx.push(ti);
    values[bi] = '';

    const { input, wrap } = targetInput(ctx, {
      placeholder: 'Tu respuesta…',
      onInput: (v) => { values[bi] = v; },
      ariaLabel: turn.hint ? `Tu turno ${bi + 1}: ${turn.hint}` : `Tu turno ${bi + 1}`,
    });
    inputs[bi] = input;

    // La pista va en su propia línea, no en el placeholder: dentro del input se
    // corta a media frase y además desaparece en cuanto empiezas a escribir,
    // que es justo cuando la necesitas.
    const turnHint = turn.hint ? h('p', { class: 'ex-dialogue__hint' }, [turn.hint]) : null;

    const correction = h('p', { class: 'ex-dialogue__correct', hidden: true }, []);
    corrections[bi] = correction;

    return h('div', { class: 'ex-dialogue__turn ex-dialogue__turn--blank' }, [who, turnHint, wrap, correction]);
  });

  const el = h('div', { class: 'ex ex-dialogue' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt]),
    h('div', { class: 'ex-dialogue__list' }, turnNodes),
    feedback,
    explain,
  ]);

  function finalize(perBlank) {
    let anyFail = false;
    let anyClose = false;
    let firstCloseReason = 'exact';

    perBlank.forEach((r, bi) => {
      const isFail = r.result === 'fail';
      const isClose = r.result === 'close';
      if (isFail) anyFail = true;
      if (isClose) {
        anyClose = true;
        if (firstCloseReason === 'exact') firstCloseReason = r.reason;
      }

      inputs[bi].disabled = true;
      inputs[bi].classList.add(isFail ? 'is-incorrect' : isClose ? 'is-close' : 'is-correct');

      if (isFail || isClose || r.reason === 'accents') {
        corrections[bi].hidden = false;
        corrections[bi].innerHTML = '';
        corrections[bi].appendChild(document.createTextNode('→ '));
        const node = h('span', { lang: ctx.lang }, [
          isFail ? document.createTextNode(r.expected) : diffNode(values[bi], r.expected),
        ]);
        corrections[bi].appendChild(node);
        const btn = audioButton(ctx, r.expected);
        if (btn) corrections[bi].appendChild(btn);
      }

    });

    const correct = !anyFail;
    const close = correct && anyClose;

    setFeedback(feedback, {
      kind: anyFail ? 'err' : anyClose ? 'warn' : 'ok',
      text: anyFail
        ? 'Alguno de tus turnos no encaja: mira las correcciones.'
        : anyClose
          ? 'Correcto, pero revisa la ortografía de lo marcado en ámbar.'
          : 'Correcto, la conversación funciona.',
    });
    showExplain(explain);

    return { correct, close, reason: anyFail ? 'none' : anyClose ? firstCloseReason : 'exact' };
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const perBlank = blankIdx.map((ti, bi) =>
        grader.check(values[bi], turns[ti].accept, { lang: ctx.lang, strictAccents })
      );
      const { correct, close, reason } = finalize(perBlank);
      result = { correct, close, reason, userAnswer: values.slice() };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      blankIdx.forEach((ti, bi) => {
        inputs[bi].value = turns[ti].accept[0];
        inputs[bi].disabled = true;
        inputs[bi].classList.add('is-correct');
      });
      showExplain(explain);
      result = { correct: false, close: false, reason: 'none', userAnswer: values.slice() };
    },
    focus: () => inputs[0]?.focus(),
    canCheck: () => values.length > 0 && values.every((v) => String(v ?? '').trim() !== ''),
    isSelfAssessed: false,
  };
}
