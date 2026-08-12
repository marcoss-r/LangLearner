// js/exercises/fillBlank.js — rellena los huecos (SPEC-DATOS §6.3).
// `text` se parte por "___" y se intercalan los huecos en orden con
// `blanks`. Si hay `bank`, los huecos son botones que abren un selector con
// las palabras barajadas (mejor en móvil que teclado para huecos cortos); si
// no, son <input> con las reglas de iOS + barra de acentos.
import { h, modal } from '../ui.js';
import * as grader from '../grader.js';
import { shuffle, feedbackNode, setFeedback, explainNode, showExplain, targetInput } from './shared.js';

export function render(exercise, ctx) {
  const blanks = exercise.blanks;
  const values = new Array(blanks.length).fill('');
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);
  const strictAccents = !!exercise.strictAccents;

  const parts = exercise.text.split('___');
  const bank = exercise.bank ? shuffle(exercise.bank) : null;

  const blankButtons = []; // solo modo banco
  const blankInputs = []; // solo modo input libre
  const blankCorrections = []; // spans de "forma correcta" tras corregir

  function setValue(idx, value) {
    values[idx] = value;
    if (blankButtons[idx]) blankButtons[idx].textContent = value || '_____';
    if (blankInputs[idx]) blankInputs[idx].value = value;
  }

  function openPicker(idx) {
    if (checked) return;
    let close;
    const body = h(
      'div',
      { class: 'ex-bank-picker' },
      bank.map((word) =>
        h(
          'button',
          {
            type: 'button',
            class: 'ex-bank-picker__item',
            lang: ctx.lang,
            onClick: () => {
              setValue(idx, word);
              close();
            },
          },
          [word]
        )
      )
    );
    close = modal({ title: 'Elige la palabra', body, actions: [{ label: 'Cancelar', kind: 'ghost' }] });
  }

  const inline = [];
  blanks.forEach((_, idx) => {
    if (parts[idx]) inline.push(document.createTextNode(parts[idx]));

    if (bank) {
      const btn = h(
        'button',
        {
          type: 'button',
          class: 'ex-blank ex-blank--bank',
          lang: ctx.lang,
          onClick: () => openPicker(idx),
        },
        ['_____']
      );
      blankButtons[idx] = btn;
      inline.push(btn);
    } else {
      const { input, wrap } = targetInput(ctx, {
        placeholder: '…',
        onInput: (v) => {
          values[idx] = v; // no usar setValue: pisaría lo que el usuario está tecleando
        },
        ariaLabel: `Hueco ${idx + 1}`,
      });
      wrap.classList.add('ex-blank', 'ex-blank--input');
      blankInputs[idx] = input;
      inline.push(wrap);
    }

    const correctionSpan = h('span', { class: 'ex-fillblank-correct', hidden: true }, []);
    blankCorrections[idx] = correctionSpan;
    inline.push(correctionSpan);
  });
  if (parts[blanks.length]) inline.push(document.createTextNode(parts[blanks.length]));

  const el = h('div', { class: 'ex ex-fillblank' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt]),
    h('p', { class: 'ex-fillblank-text', lang: ctx.lang }, inline),
    feedback,
    explain,
  ]);

  function gradeAll() {
    return blanks.map((b, i) => grader.check(values[i], b.accept, { lang: ctx.lang, strictAccents }));
  }

  function finalize(perBlank) {
    let anyFail = false;
    let anyClose = false;
    let firstCloseReason = 'exact';

    perBlank.forEach((r, i) => {
      const target = blankButtons[i] || blankInputs[i];
      const isFail = r.result === 'fail';
      const isClose = r.result === 'close';
      if (isFail) anyFail = true;
      if (isClose) {
        anyClose = true;
        if (firstCloseReason === 'exact') firstCloseReason = r.reason;
      }
      const cls = isFail ? 'is-incorrect' : isClose ? 'is-close' : 'is-correct';
      if (target) {
        target.classList.remove('is-incorrect', 'is-close', 'is-correct');
        target.classList.add(cls);
      }
      if (blankInputs[i]) blankInputs[i].disabled = true;
      if (isFail || isClose) {
        blankCorrections[i].hidden = false;
        blankCorrections[i].textContent = ` (correcto: ${r.expected}) `;
      }
    });

    const correct = !anyFail;
    const close = correct && anyClose;

    setFeedback(feedback, {
      kind: anyFail ? 'err' : anyClose ? 'warn' : 'ok',
      text: anyFail
        ? 'Alguno de los huecos no es correcto: revisa las correcciones en el texto.'
        : anyClose
          ? 'Correcto, pero cuidado con la ortografía exacta (marcado en ámbar).'
          : 'Correcto.',
    });
    showExplain(explain);

    return { correct, close, reason: anyFail ? 'none' : anyClose ? firstCloseReason : 'exact' };
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const perBlank = gradeAll();
      const { correct, close, reason } = finalize(perBlank);
      result = { correct, close, reason, userAnswer: values.slice() };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      blanks.forEach((b, i) => {
        setValue(i, b.accept[0]);
        if (blankButtons[i]) blankButtons[i].classList.add('is-correct');
        if (blankInputs[i]) {
          blankInputs[i].classList.add('is-correct');
          blankInputs[i].disabled = true;
        }
      });
      showExplain(explain);
      // Revelar no puntua: se deja un Result sin credito para que un
      // check() posterior no devuelva null (el contrato exige idempotencia).
      result = { correct: false, close: false, reason: 'none',
      userAnswer: values.slice(), };
    },
    focus: () => (blankButtons[0] || blankInputs[0])?.focus(),
    canCheck: () => values.every((v) => String(v ?? '').trim() !== ''),
    isSelfAssessed: false,
  };
}
