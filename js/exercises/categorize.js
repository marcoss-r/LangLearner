// js/exercises/categorize.js — clasificar en cubos (SPEC-DATOS §6.13).
// Toque en el ítem (queda pendiente) → toque en el cubo (se mueve dentro).
// Tocar un ítem ya colocado en un cubo lo devuelve al banco. Sin drag and
// drop: en iOS el arrastre compite con el scroll.
import { h } from '../ui.js';
import { feedbackNode, setFeedback, explainNode, showExplain } from './shared.js';

export function render(exercise, ctx) {
  const items = exercise.items;
  const assigned = new Array(items.length).fill(null); // índice de bucket, o null
  let pendingItem = null;
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);

  const pool = h('div', { class: 'ex-categorize__pool' }, []);
  const bucketLists = exercise.buckets.map(() => h('div', { class: 'ex-categorize__bucket-list' }, []));

  const itemButtons = items.map((item, idx) =>
    h(
      'button',
      {
        type: 'button',
        class: 'ex-categorize__item',
        lang: ctx.lang,
        onClick: () => handleItemTap(idx),
      },
      [item.text]
    )
  );

  function handleItemTap(idx) {
    if (checked) return;
    if (assigned[idx] != null) {
      // Ya está en un cubo: un segundo toque lo devuelve al banco.
      assigned[idx] = null;
      pool.appendChild(itemButtons[idx]);
      if (pendingItem === idx) pendingItem = null;
      paintPending();
      return;
    }
    pendingItem = pendingItem === idx ? null : idx;
    paintPending();
  }

  function handleBucketTap(bucketIdx) {
    if (checked || pendingItem == null) return;
    assigned[pendingItem] = bucketIdx;
    bucketLists[bucketIdx].appendChild(itemButtons[pendingItem]);
    pendingItem = null;
    paintPending();
  }

  function paintPending() {
    itemButtons.forEach((btn, idx) => btn.classList.toggle('is-pending', pendingItem === idx));
  }

  const bucketNodes = exercise.buckets.map((name, bucketIdx) =>
    h('div', { class: 'ex-categorize__bucket' }, [
      h(
        'button',
        {
          type: 'button',
          class: 'ex-categorize__bucket-title',
          onClick: () => handleBucketTap(bucketIdx),
        },
        [name]
      ),
      bucketLists[bucketIdx],
    ])
  );

  itemButtons.forEach((btn) => pool.appendChild(btn));

  const el = h('div', { class: 'ex ex-categorize' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt]),
    h('p', { class: 'ex-hint-static text-dim' }, ['Toca una palabra y luego el cubo donde va.']),
    pool,
    h('div', { class: 'ex-categorize__buckets' }, bucketNodes),
    feedback,
    explain,
  ]);

  function paintResult() {
    itemButtons.forEach((btn, idx) => {
      const correct = assigned[idx] === items[idx].bucket;
      btn.classList.toggle('is-correct', correct);
      btn.classList.toggle('is-incorrect', !correct);
    });
  }

  function finalize(correct) {
    paintResult();
    setFeedback(feedback, {
      kind: correct ? 'ok' : 'err',
      text: correct ? 'Correcto.' : 'Alguna palabra está en el cubo equivocado: marcada en rojo.',
    });
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const correct = items.every((item, idx) => assigned[idx] === item.bucket);
      finalize(correct);
      result = { correct, close: false, reason: correct ? 'exact' : 'none', userAnswer: assigned.slice() };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      // Mueve cada ítem a su cubo correcto para mostrar la solución.
      items.forEach((item, idx) => {
        if (assigned[idx] !== item.bucket) {
          assigned[idx] = item.bucket;
          bucketLists[item.bucket].appendChild(itemButtons[idx]);
        }
      });
      finalize(true);
      // Revelar no puntua: se deja un Result sin credito para que un
      // check() posterior no devuelva null (el contrato exige idempotencia).
      result = { correct: false, close: false, reason: 'none',
      userAnswer: assigned.slice(), };
    },
    focus: () => itemButtons[0]?.focus(),
    canCheck: () => assigned.every((a) => a != null),
    isSelfAssessed: false,
  };
}
