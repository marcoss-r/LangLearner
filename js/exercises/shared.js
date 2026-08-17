// js/exercises/shared.js — utilidades compartidas por los renderers de tipo
// de ejercicio (Fase 2). No es parte del contrato (SPEC-DATOS §6 / PLAN.md
// §10): es infraestructura interna que evita duplicar el mismo código de
// pintado de feedback, barajado, audio e inputs en cada tipo. El segundo
// agente (los 8 tipos restantes) puede reutilizarla o no: no es obligatoria.
import { h, accentBar } from '../ui.js';
import * as grader from '../grader.js';

/** Fisher-Yates. Nunca confíes en el orden del JSON para lo que se baraja en pantalla. */
export function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Bloque de feedback con aria-live, vacío hasta que check()/reveal() lo rellenen. */
export function feedbackNode() {
  return h('div', { class: 'ex-feedback', 'aria-live': 'polite' }, []);
}

/** kind: 'ok' | 'err' | 'warn' | null. text: string | Node. */
export function setFeedback(node, { kind, text } = {}) {
  node.innerHTML = '';
  node.className = `ex-feedback${kind ? ` ex-feedback--${kind}` : ''}`;
  if (text) node.appendChild(typeof text === 'string' ? document.createTextNode(text) : text);
}

/** `explain` se muestra tras responder, acierte o falle (SPEC-DATOS §6), nunca antes. */
export function explainNode(exercise) {
  if (!exercise.explain) return null;
  return h('div', { class: 'ex-explain', hidden: true }, [exercise.explain]);
}

export function showExplain(node) {
  if (node) node.hidden = false;
}

/** Botón ▶ (o 🐢 a velocidad lenta) que reproduce `text` con ctx.speak/speakSlow. */
export function audioButton(ctx, text, { slow = false, label } = {}) {
  if (!text) return null;
  return h(
    'button',
    {
      type: 'button',
      class: 'ex-audio-btn',
      'aria-label': label || (slow ? 'Escuchar más despacio' : 'Escuchar'),
      onClick: () => {
        const p = slow ? ctx.speakSlow(text) : ctx.speak(text);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      },
    },
    [slow ? '🐢' : '▶']
  );
}

/**
 * Input de texto con todas las reglas de iOS obligatorias (PLAN.md §4) y su
 * barra de acentos enganchada justo debajo. Devuelve { input, wrap }: `wrap`
 * es lo que hay que insertar en el layout.
 */
export function targetInput(ctx, { placeholder = '', value = '', onInput, ariaLabel } = {}) {
  const input = h('input', {
    type: 'text',
    class: 'ex-input',
    placeholder,
    value,
    lang: ctx.lang,
    autocapitalize: 'off',
    autocorrect: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': ariaLabel || null,
    onInput: (ev) => onInput && onInput(ev.target.value),
  });
  const bar = accentBar(input, ctx.lang);
  const wrap = h('div', { class: 'ex-input-wrap' }, [input, bar]);
  return { input, wrap };
}

/**
 * Input para respuestas EN ESPAÑOL (traducción inversa, dictado traducido).
 * A diferencia de `targetInput` no lleva `lang` de idioma meta ni barra de
 * acentos: el teclado español del iPhone ya escribe español sin estorbar.
 * Sigue a 16px para que iOS no haga zoom al enfocarlo.
 */
export function esInput({ placeholder = '', onInput, ariaLabel } = {}) {
  return h('input', {
    type: 'text',
    class: 'ex-input',
    placeholder,
    lang: 'es',
    autocapitalize: 'off',
    autocorrect: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': ariaLabel || null,
    onInput: (ev) => onInput && onInput(ev.target.value),
  });
}

/**
 * Solución correcta con el tramo divergente resaltado, para los mensajes de
 * "casi". `grader.diffHint` devuelve la marca en **negrita markdown**; aquí se
 * convierte a nodos reales porque el feedback nunca usa innerHTML con texto
 * que viene del JSON de contenido.
 */
export function diffNode(user, expected) {
  const marked = grader.diffHint(user, expected);
  const frag = document.createDocumentFragment();
  marked.split(/(\*\*[^*]*\*\*)/).forEach((chunk) => {
    if (!chunk) return;
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      frag.appendChild(h('strong', { class: 'ex-diff' }, [chunk.slice(2, -2)]));
    } else {
      frag.appendChild(document.createTextNode(chunk));
    }
  });
  return frag;
}

/**
 * Fábrica común a mcq / true_false / odd_one_out: una lista de opciones con
 * una única correcta, selección por toque y confirmación explícita con
 * check(). Evita triplicar el mismo pintado en los tres tipos.
 *
 * `mapUserAnswer(index)` transforma el índice elegido para el Result.userAnswer
 * (p.ej. true_false lo convierte a boolean).
 */
export function singleChoice(
  ctx,
  { exercise, promptNode, options, correctIndex, optionLang = null, mapUserAnswer = (i) => i }
) {
  let selected = null;
  let checked = false;
  let result = null;

  const feedback = feedbackNode();
  const explain = explainNode(exercise);

  const buttons = options.map((label, i) =>
    h(
      'button',
      {
        type: 'button',
        class: 'ex-option',
        lang: optionLang,
        onClick: () => {
          if (checked) return;
          selected = i;
          buttons.forEach((b, j) => b.classList.toggle('is-selected', j === i));
        },
      },
      [label]
    )
  );

  function paint() {
    buttons.forEach((b, i) => {
      b.classList.toggle('is-correct', i === correctIndex);
      b.classList.toggle('is-incorrect', i === selected && i !== correctIndex);
    });
  }

  function finalize(correct) {
    paint();
    setFeedback(feedback, {
      kind: correct ? 'ok' : 'err',
      text: correct ? 'Correcto.' : `Incorrecto. La respuesta correcta es «${options[correctIndex]}».`,
    });
    showExplain(explain);
  }

  const el = h('div', { class: 'ex' }, [
    promptNode,
    h('div', { class: 'ex-options', role: 'group' }, buttons),
    feedback,
    explain,
  ]);

  return {
    el,
    check() {
      if (checked) return result;
      checked = true;
      const correct = selected === correctIndex;
      finalize(correct);
      result = { correct, close: false, reason: correct ? 'exact' : 'none', userAnswer: mapUserAnswer(selected) };
      if (ctx.onAnswered) ctx.onAnswered(result);
      return result;
    },
    reveal() {
      if (checked) return;
      checked = true;
      finalize(selected === correctIndex);
      // Revelar no puntúa: se deja un Result sin crédito para que un check()
      // posterior no devuelva null (el contrato exige idempotencia).
      result = { correct: false, close: false, reason: 'none', userAnswer: mapUserAnswer(selected) };
    },
    focus: () => buttons[0]?.focus(),
    canCheck: () => selected != null,
    isSelfAssessed: false,
  };
}

/**
 * Fila de autoevaluación "Me ha costado" / "Bien", usada por `shadowing` y
 * `speak_prompt` (SPEC-DATOS §6.10, §6.11): ambos comparten exactamente el
 * mismo patrón de dos botones exclusivos que fijan un valor 'costo'|'bien'.
 * Se centraliza aquí para no duplicar el mismo bloque en dos ficheros.
 * El caller decide cuándo mostrarla (row.hidden = false) y cuándo
 * deshabilitarla (disable()) tras check()/reveal().
 */
export function selfAssessRow(onChoose) {
  let value = null;

  function choose(v) {
    value = v;
    hardBtn.classList.toggle('is-selected', v === 'costo');
    okBtn.classList.toggle('is-selected', v === 'bien');
    if (onChoose) onChoose(v);
  }

  const hardBtn = h(
    'button',
    { type: 'button', class: 'ex-selfassess__btn ex-selfassess__btn--hard', onClick: () => choose('costo') },
    ['Me ha costado']
  );
  const okBtn = h(
    'button',
    { type: 'button', class: 'ex-selfassess__btn ex-selfassess__btn--ok', onClick: () => choose('bien') },
    ['Bien']
  );
  const row = h('div', { class: 'ex-selfassess', hidden: true }, [hardBtn, okBtn]);

  return {
    row,
    getValue: () => value,
    disable: () => {
      hardBtn.disabled = true;
      okBtn.disabled = true;
    },
  };
}
