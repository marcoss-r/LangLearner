// js/exercises/wordOrder.js — ordenar palabras (SPEC-DATOS §6.7).
// Los `tokens` se barajan en un banco abajo; tocarlos los sube a la zona de
// respuesta en el orden de toque; tocar uno de la respuesta lo devuelve al
// banco. Tipo crítico en alemán: la zona de respuesta debe envolver (wrap)
// bien frases de 8-10 palabras sin desbordar a 376px de ancho.
import { h } from '../ui.js';
import { shuffle, feedbackNode, setFeedback, explainNode, showExplain, audioButton } from './shared.js';

export function render(exercise, ctx) {
  const tokens = exercise.tokens.map((text, id) => ({ text, id }));
  const bankOrder = shuffle(tokens);
  const answerOrder = []; // array de ids, en el orden elegido
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);

  const bankZone = h('div', { class: 'ex-word-order__bank' }, []);
  const answerZone = h('div', { class: 'ex-word-order__answer' }, []);

  const tokenButtons = new Map(); // id -> button

  function makeToken(entry) {
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'ex-word-order__token',
        lang: ctx.lang,
        onClick: () => handleTap(entry.id),
      },
      [entry.text]
    );
    tokenButtons.set(entry.id, btn);
    return btn;
  }

  bankOrder.forEach((entry) => bankZone.appendChild(makeToken(entry)));

  function handleTap(id) {
    if (checked) return;
    const btn = tokenButtons.get(id);
    const inAnswer = answerOrder.includes(id);
    if (inAnswer) {
      const pos = answerOrder.indexOf(id);
      answerOrder.splice(pos, 1);
      bankZone.appendChild(btn);
      btn.classList.remove('is-used');
    } else {
      answerOrder.push(id);
      answerZone.appendChild(btn);
      btn.classList.add('is-used');
    }
  }

  const audio = exercise.audio ? audioButton(ctx, exercise.audio) : null;

  const el = h('div', { class: 'ex ex-word-order' }, [
    h('div', { class: 'ex-prompt-row' }, [h('p', { class: 'ex-prompt' }, [exercise.prompt]), audio]),
    h('div', { class: 'ex-word-order__answer-label text-dim' }, ['Tu frase:']),
    answerZone,
    h('div', { class: 'ex-word-order__bank-label text-dim' }, ['Banco de palabras:']),
    bankZone,
    feedback,
    explain,
  ]);

  function currentTexts() {
    return answerOrder.map((id) => tokens.find((t) => t.id === id).text);
  }

  function arraysEqual(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  function isCorrectAnswer(texts) {
    if (arraysEqual(texts, exercise.answer)) return true;
    return (exercise.alsoAccept || []).some((alt) => arraysEqual(texts, alt));
  }

  function finalize(correct, texts) {
    answerOrder.forEach((id) => {
      const btn = tokenButtons.get(id);
      btn.classList.toggle('is-correct', correct);
      btn.classList.toggle('is-incorrect', !correct);
    });
    setFeedback(feedback, {
      kind: correct ? 'ok' : 'err',
      text: correct ? 'Correcto.' : `Incorrecto. Una forma correcta es: «${exercise.answer.join(' ')}».`,
    });
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const texts = currentTexts();
      const correct = isCorrectAnswer(texts);
      finalize(correct, texts);
      result = { correct, close: false, reason: correct ? 'exact' : 'none', userAnswer: texts };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      // Vacía la respuesta actual (si había alguna, quizá en orden erróneo) y
      // reconstruye desde cero en el orden correcto: si solo añadiéramos los
      // tokens que faltan al final, una respuesta parcial ya empezada mal
      // quedaría con los primeros tokens fuera de sitio.
      answerOrder.length = 0;
      exercise.answer.forEach((text) => {
        const entry = tokens.find((t) => t.text === text && !answerOrder.includes(t.id));
        if (entry) {
          answerOrder.push(entry.id);
          answerZone.appendChild(tokenButtons.get(entry.id));
        }
      });
      finalize(true, currentTexts());
      // Revelar no puntua: se deja un Result sin credito para que un
      // check() posterior no devuelva null (el contrato exige idempotencia).
      result = { correct: false, close: false, reason: 'none',
      userAnswer: currentTexts(), };
    },
    focus: () => bankZone.querySelector('button')?.focus(),
    canCheck: () => answerOrder.length === tokens.length,
    isSelfAssessed: false,
  };
}
