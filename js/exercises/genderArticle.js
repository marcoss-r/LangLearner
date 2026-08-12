// js/exercises/genderArticle.js — género y artículo (SPEC-DATOS §6.12).
// Varios `items` en el mismo ejercicio, cada uno con sus propios botones de
// artículo. `correct` global solo si aciertan todos; cada línea se pinta por
// separado y muestra su `hint` si falla.
import { h } from '../ui.js';
import { feedbackNode, setFeedback, explainNode, showExplain } from './shared.js';

export function render(exercise, ctx) {
  const items = exercise.items;
  const selections = new Array(items.length).fill(null);
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);

  const rows = items.map((item, idx) => {
    const optButtons = item.options.map((opt, oi) =>
      h(
        'button',
        {
          type: 'button',
          class: 'ex-option ex-option--sm',
          lang: ctx.lang,
          onClick: () => {
            if (checked) return;
            selections[idx] = oi;
            optButtons.forEach((b, j) => b.classList.toggle('is-selected', j === oi));
          },
        },
        [opt]
      )
    );

    const hintNode = h('p', { class: 'ex-hint', hidden: true }, [item.hint || '']);

    const wrap = h('div', { class: 'ex-gender-row' }, [
      h('span', { class: 'ex-gender-row__word', lang: ctx.lang }, [item.word]),
      h('div', { class: 'ex-options ex-options--inline', role: 'group' }, optButtons),
      hintNode,
    ]);

    return { wrap, optButtons, hintNode, item };
  });

  function paint() {
    rows.forEach((r, idx) => {
      const sel = selections[idx];
      r.optButtons.forEach((b, oi) => {
        b.classList.toggle('is-correct', oi === r.item.answer);
        b.classList.toggle('is-incorrect', oi === sel && oi !== r.item.answer);
      });
      const wrong = sel !== r.item.answer;
      r.hintNode.hidden = !(wrong && r.item.hint);
    });
  }

  const el = h('div', { class: 'ex ex-gender-article' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt]),
    h('div', { class: 'ex-gender-list' }, rows.map((r) => r.wrap)),
    feedback,
    explain,
  ]);

  function finalize(correct) {
    paint();
    setFeedback(feedback, {
      kind: correct ? 'ok' : 'err',
      text: correct ? 'Correcto.' : 'Alguno de los artículos no es correcto: revisa las líneas marcadas en rojo.',
    });
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const correct = rows.every((r, idx) => selections[idx] === r.item.answer);
      finalize(correct);
      result = { correct, close: false, reason: correct ? 'exact' : 'none', userAnswer: selections.slice() };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      finalize(rows.every((r, idx) => selections[idx] === r.item.answer));
      // Revelar no puntua: se deja un Result sin credito para que un
      // check() posterior no devuelva null (el contrato exige idempotencia).
      result = { correct: false, close: false, reason: 'none',
      userAnswer: selections.slice(), };
    },
    focus: () => rows[0]?.optButtons[0]?.focus(),
    canCheck: () => selections.every((s) => s != null),
    isSelfAssessed: false,
  };
}
