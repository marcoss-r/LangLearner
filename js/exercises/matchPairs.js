// js/exercises/matchPairs.js — unir columnas (SPEC-DATOS §6.6).
// Toque en izquierda → toque en derecha → se emparejan (mismo número). Un
// segundo toque sobre un elemento ya emparejado lo deshace. Sin drag and
// drop: en iOS el arrastre compite con el scroll. `right` se baraja aquí,
// nunca hay que confiar en el orden del JSON.
import { h } from '../ui.js';
import { shuffle, feedbackNode, setFeedback, explainNode, showExplain } from './shared.js';

export function render(exercise, ctx) {
  const leftLabels = exercise.left;
  // {text, origIndex}: origIndex es la posición real en `right` del JSON,
  // imprescindible para corregir contra `exercise.answer` tras barajar.
  const rightShuffled = shuffle(exercise.right.map((text, origIndex) => ({ text, origIndex })));

  const pairs = new Map(); // leftIndex -> rightOrigIndex
  let pairNumbers = new Map(); // leftIndex -> número mostrado (1, 2, 3...)
  let pending = null; // { side: 'left'|'right', idx }
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);

  const leftButtons = leftLabels.map((text, idx) => makeItem(text, 'left', idx));
  const rightButtons = rightShuffled.map((entry) => makeItem(entry.text, 'right', entry.origIndex));

  function badgeOf(btn) {
    return btn.querySelector('.ex-match__badge');
  }

  function makeItem(text, side, idx) {
    const badge = h('span', { class: 'ex-match__badge' }, []);
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'ex-match__item',
        lang: ctx.lang,
        onClick: () => handleTap(side, idx),
      },
      [badge, h('span', { class: 'ex-match__text' }, [text])]
    );
    return btn;
  }

  function renumber() {
    pairNumbers = new Map();
    const leftIdxs = [...pairs.keys()].sort((a, b) => a - b);
    leftIdxs.forEach((li, i) => pairNumbers.set(li, i + 1));
  }

  function paintPairing() {
    leftButtons.forEach((btn, i) => {
      const isPending = pending && pending.side === 'left' && pending.idx === i;
      const isPaired = pairs.has(i);
      btn.classList.toggle('is-pending', !!isPending);
      btn.classList.toggle('is-paired', isPaired);
      badgeOf(btn).textContent = isPaired ? String(pairNumbers.get(i)) : '';
    });
    rightButtons.forEach((btn, shuffledIdx) => {
      const origIndex = rightShuffled[shuffledIdx].origIndex;
      const isPending = pending && pending.side === 'right' && pending.idx === origIndex;
      const pairedLeft = [...pairs.entries()].find(([, r]) => r === origIndex);
      btn.classList.toggle('is-pending', !!isPending);
      btn.classList.toggle('is-paired', !!pairedLeft);
      badgeOf(btn).textContent = pairedLeft ? String(pairNumbers.get(pairedLeft[0])) : '';
    });
  }

  function handleTap(side, idx) {
    if (checked) return;

    const isPaired = side === 'left' ? pairs.has(idx) : [...pairs.values()].includes(idx);
    if (isPaired) {
      // Segundo toque sobre un elemento ya emparejado: deshace la pareja.
      if (side === 'left') {
        pairs.delete(idx);
      } else {
        const leftIdx = [...pairs.entries()].find(([, r]) => r === idx)?.[0];
        if (leftIdx != null) pairs.delete(leftIdx);
      }
      if (pending && pending.side === side && pending.idx === idx) pending = null;
      renumber();
      paintPairing();
      return;
    }

    if (!pending) {
      pending = { side, idx };
      paintPairing();
      return;
    }
    if (pending.side === side) {
      // Cambia la selección pendiente por otra del mismo lado.
      pending = { side, idx };
      paintPairing();
      return;
    }

    const leftIdx = side === 'left' ? idx : pending.idx;
    const rightIdx = side === 'right' ? idx : pending.idx;
    pairs.set(leftIdx, rightIdx);
    pending = null;
    renumber();
    paintPairing();
  }

  const el = h('div', { class: 'ex ex-match-pairs' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt]),
    h('div', { class: 'ex-match' }, [
      h('div', { class: 'ex-match__col' }, leftButtons),
      h('div', { class: 'ex-match__col' }, rightButtons),
    ]),
    feedback,
    explain,
  ]);

  function paintResult() {
    leftButtons.forEach((btn, leftIdx) => {
      const expected = exercise.answer[leftIdx];
      const actual = pairs.get(leftIdx);
      btn.classList.toggle('is-correct', actual === expected);
      btn.classList.toggle('is-incorrect', actual !== expected);
    });
    // A la derecha solo se pinta lo que el usuario emparejó: un elemento sin
    // tocar no se marca (ni verde ni rojo), la solución completa se explica
    // aparte en el bloque de corrección para no dar la respuesta gratis.
    rightButtons.forEach((btn, shuffledIdx) => {
      const origIndex = rightShuffled[shuffledIdx].origIndex;
      const pairedLeft = [...pairs.entries()].find(([, r]) => r === origIndex)?.[0];
      const matches = pairedLeft != null && exercise.answer[pairedLeft] === origIndex;
      btn.classList.toggle('is-correct', pairedLeft != null && matches);
      btn.classList.toggle('is-incorrect', pairedLeft != null && !matches);
    });
  }

  function correctionList() {
    return h(
      'ul',
      { class: 'ex-match__correction' },
      leftLabels.map((label, li) =>
        h('li', {}, [
          h('span', { lang: ctx.lang }, [label]),
          ' → ',
          h('span', { lang: ctx.lang }, [exercise.right[exercise.answer[li]]]),
        ])
      )
    );
  }

  function finalize(correct) {
    paintResult();
    setFeedback(feedback, {
      kind: correct ? 'ok' : 'err',
      text: correct
        ? 'Correcto.'
        : h('div', {}, ['Alguna pareja no es correcta. La solución completa:', correctionList()]),
    });
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const correct = leftLabels.every((_, li) => pairs.get(li) === exercise.answer[li]);
      finalize(correct);
      result = {
        correct,
        close: false,
        reason: correct ? 'exact' : 'none',
        userAnswer: leftLabels.map((_, li) => pairs.get(li) ?? null),
      };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      // A diferencia de check(), reveal() debe mostrar la solución completa
      // aunque el usuario no haya emparejado nada: fuerza el emparejamiento
      // correcto antes de pintar.
      pairs.clear();
      leftLabels.forEach((_, li) => pairs.set(li, exercise.answer[li]));
      renumber();
      paintPairing();
      finalize(true);
      // Revelar no puntua: se deja un Result sin credito para que un
      // check() posterior no devuelva null (el contrato exige idempotencia).
      result = { correct: false, close: false, reason: 'none',
      userAnswer: leftLabels.map((_, li) => pairs.get(li) ?? null), };
    },
    focus: () => leftButtons[0]?.focus(),
    canCheck: () => pairs.size === leftLabels.length,
    isSelfAssessed: false,
  };
}
