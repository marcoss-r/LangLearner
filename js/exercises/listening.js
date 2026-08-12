// js/exercises/listening.js — dictado y comprensión oral (SPEC-DATOS §6.9).
// El texto NUNCA se ve antes de responder: es lo único que hace que el
// ejercicio sea de escucha y no de lectura. Tres modos: write (escribe lo que
// oyes), choose (elige entre opciones) y translate (escribe la traducción).
import { h } from '../ui.js';
import * as grader from '../grader.js';
import * as audio from '../audio.js';
import {
  feedbackNode, setFeedback, explainNode, showExplain,
  targetInput, esInput, audioButton, diffNode, singleChoice,
} from './shared.js';

const LANG_NAME = { fr: 'francesa', de: 'alemana' };

/** Aviso cuando el iPhone no tiene ninguna voz instalada del idioma. */
function voiceWarning(lang) {
  const node = h('p', { class: 'ex-hint-static ex-voice-warning', hidden: true }, [
    `No hay ninguna voz ${LANG_NAME[lang] || ''} instalada en este dispositivo. `,
    'Puedes añadirla en Ajustes → Accesibilidad → Contenido hablado → Voces.',
  ]);
  // Asíncrono a propósito: hasVoiceFor espera a que Safari publique las voces,
  // y no queremos bloquear el pintado del ejercicio por ello.
  audio.hasVoiceFor(lang).then((has) => { node.hidden = !!has; }).catch(() => {});
  return node;
}

export function render(exercise, ctx) {
  const mode = exercise.mode || 'write';
  const spoken = exercise.speak;

  const controls = h('div', { class: 'ex-listen-controls' }, [
    audioButton(ctx, spoken, { label: 'Escuchar' }),
    audioButton(ctx, spoken, { slow: true }),
  ]);
  const warning = voiceWarning(ctx.lang);

  // El texto original y su traducción, ocultos hasta que se responde.
  const transcript = h('div', { class: 'ex-listen-transcript', hidden: true }, []);
  function revealTranscript() {
    if (exercise.showTextAfter === false) return;
    transcript.hidden = false;
    transcript.innerHTML = '';
    transcript.appendChild(h('p', { class: 'ex-listen-transcript__target selectable', lang: ctx.lang }, [spoken]));
    if (exercise.es) transcript.appendChild(h('p', { class: 'ex-listen-transcript__es selectable' }, [exercise.es]));
  }

  // --- Modo "choose": se apoya en la misma fábrica que mcq -------------------
  if (mode === 'choose') {
    const promptNode = h('div', {}, [
      h('p', { class: 'ex-prompt' }, [exercise.prompt || 'Escucha y elige la opción correcta.']),
      controls,
      warning,
    ]);
    const inner = singleChoice(ctx, {
      exercise,
      promptNode,
      options: exercise.options,
      correctIndex: exercise.answer,
      optionLang: ctx.lang,
    });
    inner.el.classList.add('ex-listening');
    inner.el.insertBefore(transcript, inner.el.querySelector('.ex-explain') || null);

    const baseCheck = inner.check;
    const baseReveal = inner.reveal;
    inner.check = () => { const r = baseCheck(); revealTranscript(); return r; };
    inner.reveal = () => { baseReveal(); revealTranscript(); };
    return inner;
  }

  // --- Modos "write" y "translate" ------------------------------------------
  const toEs = mode === 'translate';
  let value = '';
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);
  const strictAccents = toEs ? false : !!exercise.strictAccents;
  const graderLang = toEs ? 'es' : ctx.lang;

  let input;
  let inputBlock;
  if (toEs) {
    input = esInput({ placeholder: 'Escribe la traducción…', onInput: (v) => { value = v; }, ariaLabel: 'Tu traducción' });
    inputBlock = input;
  } else {
    const built = targetInput(ctx, { placeholder: 'Escribe lo que oyes…', onInput: (v) => { value = v; }, ariaLabel: 'Lo que oyes' });
    input = built.input;
    inputBlock = built.wrap;
  }

  const el = h('div', { class: 'ex ex-listening' }, [
    h('p', { class: 'ex-prompt' }, [exercise.prompt || (toEs ? 'Escucha y escribe la traducción.' : 'Escucha y escribe lo que oyes.')]),
    controls,
    warning,
    inputBlock,
    feedback,
    transcript,
    explain,
  ]);

  function finalize(r) {
    input.disabled = true;
    if (r.result === 'ok' && r.reason === 'accents') {
      input.classList.add('is-correct');
      setFeedback(feedback, { kind: 'ok', text: h('span', {}, ['Correcto. La grafía exacta es ', h('strong', { lang: graderLang }, [r.expected])]) });
    } else if (r.result === 'ok') {
      input.classList.add('is-correct');
      setFeedback(feedback, { kind: 'ok', text: 'Correcto.' });
    } else if (r.result === 'close') {
      input.classList.add('is-close');
      setFeedback(feedback, { kind: 'warn', text: h('span', {}, ['Casi. Era ', h('span', { lang: graderLang }, [diffNode(value, r.expected)]), '.']) });
    } else {
      input.classList.add('is-incorrect');
      setFeedback(feedback, { kind: 'err', text: h('span', {}, ['Incorrecto. Era ', h('span', { lang: graderLang }, [r.expected]), '.']) });
    }
    revealTranscript();
    showExplain(explain);
  }

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const r = grader.check(value, exercise.accept, { lang: graderLang, strictAccents });
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
      setFeedback(feedback, { kind: null, text: h('span', {}, ['Solución: ', h('span', { lang: graderLang }, [expected])]) });
      revealTranscript();
      showExplain(explain);
      result = { correct: false, close: false, reason: 'none', userAnswer: value };
    },
    focus: () => input.focus(),
    canCheck: () => value.trim() !== '',
    isSelfAssessed: false,
  };
}
