// js/exercises/conjugation.js — rellenar una tabla de conjugación
// (SPEC-DATOS §6.8). Una fila por persona, cada una con su input y su
// corrección independiente. Acierta el ejercicio solo quien acierta todas.
import { h } from '../ui.js';
import * as grader from '../grader.js';
import {
  feedbackNode, setFeedback, explainNode, showExplain,
  targetInput, audioButton, diffNode,
} from './shared.js';

export function render(exercise, ctx) {
  const rows = exercise.rows || [];
  const values = new Array(rows.length).fill('');
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);
  const strictAccents = !!exercise.strictAccents;

  const inputs = [];
  const corrections = [];
  const audioSlots = [];

  const rowNodes = rows.map((row, i) => {
    const { input, wrap } = targetInput(ctx, {
      placeholder: '…',
      onInput: (v) => { values[i] = v; },
      ariaLabel: `Forma de ${row.person}`,
    });
    inputs[i] = input;

    const correction = h('span', { class: 'ex-conj-row__correct', hidden: true }, []);
    corrections[i] = correction;

    // El ▶ de cada forma aparece solo tras corregir: antes regalaría la respuesta.
    const audioSlot = h('span', { class: 'ex-conj-row__audio', hidden: true }, []);
    audioSlots[i] = audioSlot;

    return h('div', { class: 'ex-conj-row' }, [
      h('span', { class: 'ex-conj-row__person', lang: ctx.lang }, [row.person]),
      wrap,
      correction,
      audioSlot,
    ]);
  });

  const heading = [exercise.verb, exercise.tense].filter(Boolean).join(' · ');

  const el = h('div', { class: 'ex ex-conjugation' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt]),
    heading ? h('p', { class: 'ex-conj-heading', lang: ctx.lang }, [heading]) : null,
    h('div', { class: 'ex-conj-table' }, rowNodes),
    feedback,
    explain,
  ]);

  function finalize(perRow) {
    let anyFail = false;
    let anyClose = false;
    let firstCloseReason = 'exact';

    perRow.forEach((r, i) => {
      const isFail = r.result === 'fail';
      const isClose = r.result === 'close';
      if (isFail) anyFail = true;
      if (isClose) {
        anyClose = true;
        if (firstCloseReason === 'exact') firstCloseReason = r.reason;
      }

      inputs[i].disabled = true;
      inputs[i].classList.add(isFail ? 'is-incorrect' : isClose ? 'is-close' : 'is-correct');

      if (isFail || isClose || r.reason === 'accents') {
        corrections[i].hidden = false;
        corrections[i].innerHTML = '';
        corrections[i].appendChild(document.createTextNode('→ '));
        corrections[i].appendChild(isFail ? document.createTextNode(r.expected) : diffNode(values[i], r.expected));
      }

      const btn = audioButton(ctx, rows[i].accept[0], { label: `Escuchar la forma de ${rows[i].person}` });
      if (btn) {
        audioSlots[i].hidden = false;
        audioSlots[i].appendChild(btn);
      }
    });

    const correct = !anyFail;
    const close = correct && anyClose;

    setFeedback(feedback, {
      kind: anyFail ? 'err' : anyClose ? 'warn' : 'ok',
      text: anyFail
        ? 'Hay formas incorrectas: mira las correcciones de cada persona.'
        : anyClose
          ? 'Correcto, pero repasa la ortografía de las formas en ámbar.'
          : 'Correcto, toda la conjugación.',
    });
    showExplain(explain);

    return { correct, close, reason: anyFail ? 'none' : anyClose ? firstCloseReason : 'exact' };
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const perRow = rows.map((row, i) => grader.check(values[i], row.accept, { lang: ctx.lang, strictAccents }));
      const { correct, close, reason } = finalize(perRow);
      result = { correct, close, reason, userAnswer: values.slice() };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      rows.forEach((row, i) => {
        inputs[i].value = row.accept[0];
        inputs[i].disabled = true;
        inputs[i].classList.add('is-correct');
        const btn = audioButton(ctx, row.accept[0], { label: `Escuchar la forma de ${row.person}` });
        if (btn) {
          audioSlots[i].hidden = false;
          audioSlots[i].appendChild(btn);
        }
      });
      showExplain(explain);
      result = { correct: false, close: false, reason: 'none', userAnswer: values.slice() };
    },
    focus: () => inputs[0]?.focus(),
    canCheck: () => values.every((v) => String(v ?? '').trim() !== ''),
    isSelfAssessed: false,
  };
}
