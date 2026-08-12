// js/screens/session.js — infraestructura común a las TRES pantallas de
// sesión de la Fase 3: clase (`lesson.js`), prueba de nivel (`exam.js`) y
// repaso espaciado (`review.js`).
//
// Por qué existe: las tres comparten exactamente el mismo esqueleto —barra de
// progreso arriba, un único ítem en el centro, barra de acción abajo pegada al
// borde inferior— y exactamente los mismos tres problemas sutiles:
//   1. Construir el `ctx` de los ejercicios sin que un `speak()` rechazado
//      (iPhone sin voces instaladas) rompa la sesión con una promesa suelta.
//   2. Reevaluar `canCheck()` en `click` Y en `input` delegando en `document`
//      (ver `watchCanCheck`, es donde está el porqué completo).
//   3. Limpiar esos listeners globales al cambiar de ejercicio y al salir de
//      la pantalla; si no, se acumulan 22 pares por clase y sobreviven a la
//      navegación porque el router se limita a vaciar #app.
//
// Aquí no hay nada específico de una clase, de un examen ni de una tarjeta:
// eso vive en cada pantalla.
import { h, toast, confirmDialog } from '../ui.js';
import * as store from '../store.js';
import * as audio from '../audio.js';
import { progressBar, pct, navigate } from './parts.js';
import { renderExercise, EXERCISE_FAMILIES } from '../exercises/index.js';

/* ============================================================
   Contexto de ejercicio
   ============================================================ */

/**
 * `ctx` que reciben todos los renderers de `js/exercises/`.
 *
 * `speak`/`speakSlow` devuelven una promesa YA capturada: en Chromium sin
 * cabeza y en un iPhone sin voz francesa instalada `audio.speak()` rechaza, y
 * un rechazo sin capturar aborta el manejador desde el que se llamó (y con él,
 * el flujo de la sesión). El error se degrada a un toast discreto.
 */
export function buildCtx(lang, { onAnswered, onSelfAssessed, settings } = {}) {
  const cfg = settings || store.getSettings();
  const voiceURI = lang === 'fr' ? cfg.ttsVoiceFr : cfg.ttsVoiceDe;

  const speakSafe = (fn, text) =>
    Promise.resolve()
      .then(() => fn(text, { lang, rate: cfg.ttsRate, voiceURI }))
      .catch((err) => {
        toast(err?.message || 'No se pudo reproducir el audio.', 'err');
      });

  return {
    lang,
    settings: cfg,
    speak: (text) => speakSafe(audio.speak, text),
    speakSlow: (text) => speakSafe(audio.speakSlow, text),
    onAnswered: onAnswered || (() => {}),
    onSelfAssessed: onSelfAssessed || (() => {}),
  };
}

/* ============================================================
   Reevaluación de canCheck()
   ============================================================ */

/**
 * Ejecuta `update()` tras cualquier `click` o `input` de la página, para poder
 * habilitar/deshabilitar el botón principal según `instance.canCheck()`.
 *
 * Los dos eventos son necesarios y la delegación en `document` también:
 *  - `input`: los tipos de escritura (traducción, conjugación, diálogo,
 *    dictado, corrección de errores) solo pasan a ser comprobables al teclear.
 *    Sin esto el botón se queda deshabilitado para siempre.
 *  - `document` y no `instance.el`: `fill_blank` en modo banco abre su selector
 *    con `modal()`, que se monta en `#modal-root`, fuera del `el` del
 *    ejercicio; un clic ahí no burbujea hasta el ejercicio.
 * Esto costó un fallo en la Fase 2 (ver js/screens/dev.js).
 *
 * Devuelve la función de parada. Llámala SIEMPRE al cambiar de ítem.
 */
export function watchCanCheck(update) {
  const handler = () => update();
  document.addEventListener('click', handler);
  document.addEventListener('input', handler);
  update();
  return () => {
    document.removeEventListener('click', handler);
    document.removeEventListener('input', handler);
  };
}

/** #app es el único contenedor con scroll: cada ítem nuevo empieza arriba. */
export function scrollToTop() {
  const app = document.getElementById('app');
  if (app) app.scrollTop = 0;
}

/* ============================================================
   Esqueleto de sesión
   ============================================================ */

/**
 * Marco visual común: cabecera con progreso + "Salir", cuerpo intercambiable y
 * barra de acción inferior pegada al borde (la tab bar está oculta en
 * `#/lesson` y `#/exam`, así que ese espacio es nuestro; respeta `--sab`).
 *
 * `onExit` se llama tras confirmar. Si no se pasa `confirm`, sale sin preguntar.
 */
export function sessionShell({ title, exitLabel = 'Salir', onExit, confirmExit = null } = {}) {
  const counter = h('span', { class: 'session__count' }, ['']);
  const barSlot = h('div', { class: 'session__progress' }, []);
  const body = h('div', { class: 'session__body' }, []);
  const actions = h('div', { class: 'session__actions' }, []);

  const exitBtn = onExit
    ? h(
        'button',
        {
          type: 'button',
          class: 'session__exit',
          onClick: async () => {
            if (confirmExit) {
              const ok = await confirmDialog(confirmExit);
              if (!ok) return;
            }
            onExit();
          },
        },
        [exitLabel]
      )
    : null;

  const el = h('div', { class: 'session' }, [
    h('div', { class: 'session__top' }, [
      h('div', { class: 'session__top-row' }, [
        title ? h('span', { class: 'session__title' }, [title]) : h('span', {}, []),
        counter,
        exitBtn,
      ]),
      barSlot,
    ]),
    body,
    h('div', { class: 'session__bar' }, [actions]),
  ]);

  // El router solo vacía #app: sin esto, los listeners globales de
  // watchCanCheck de la pantalla anterior seguirían vivos.
  const cleanups = [];
  const onHashChange = () => {
    cleanups.splice(0).forEach((fn) => { try { fn(); } catch { /* ya limpiado */ } });
    window.removeEventListener('hashchange', onHashChange);
  };
  window.addEventListener('hashchange', onHashChange);

  return {
    el,
    body,
    /** current/total en texto ("7 / 22") y en barra. total 0 → oculta la barra. */
    setProgress(current, total, label = 'Progreso de la sesión') {
      if (!total) {
        counter.textContent = '';
        barSlot.innerHTML = '';
        return;
      }
      counter.textContent = `${current} / ${total}`;
      barSlot.innerHTML = '';
      barSlot.appendChild(progressBar(current / total, { label }));
    },
    setBody(node) {
      body.innerHTML = '';
      if (node) body.appendChild(node);
      scrollToTop();
    },
    setActions(nodes) {
      actions.innerHTML = '';
      for (const node of Array.isArray(nodes) ? nodes : [nodes]) {
        if (node) actions.appendChild(node);
      }
    },
    /** Registra una limpieza que se ejecutará al abandonar la ruta. */
    onCleanup(fn) {
      cleanups.push(fn);
    },
  };
}

/* ============================================================
   Máquina "Comprobar → Siguiente"
   ============================================================ */

/**
 * Monta UN ejercicio en el shell y gestiona el ciclo completo:
 * habilitado según `canCheck()` → `check()` → botón "Siguiente" → `onDone`.
 *
 * `immediateFeedback: false` (examen) no llama a `check()`: el ejercicio no se
 * corrige, solo se avanza, y el resultado se calcula al entregar.
 *
 * Devuelve la instancia del renderer para que el caller pueda guardarla.
 */
export function mountExerciseStep(shell, exercise, ctx, {
  checkLabel = 'Comprobar',
  nextLabel = 'Siguiente',
  extraActions = [],
  onDone,
} = {}) {
  const instance = renderExercise(exercise, ctx);
  shell.setBody(instance.el);

  const primary = h('button', { type: 'button', class: 'btn btn--primary btn--block' }, [checkLabel]);
  shell.setActions([...extraActions, primary]);

  let stop = null;
  let phase = 'check';
  let result = null;

  const finishWatch = () => {
    if (stop) { stop(); stop = null; }
  };

  primary.addEventListener('click', () => {
    if (phase === 'check') {
      result = instance.check();
      finishWatch();
      phase = 'next';
      primary.textContent = nextLabel;
      primary.disabled = false;
      return;
    }
    finishWatch();
    if (onDone) onDone(result, instance);
  });

  stop = watchCanCheck(() => {
    if (phase !== 'check') return;
    primary.disabled = !instance.canCheck();
  });
  shell.onCleanup(finishWatch);

  return instance;
}

/* ============================================================
   Piezas de resultados compartidas por clase y examen
   ============================================================ */

export const FAMILY_NAMES = {
  reconocimiento: 'Reconocimiento',
  produccion: 'Producción escrita',
  comprension: 'Comprensión',
  escucha: 'Escucha',
  oral: 'Oral (autoevaluado)',
  libre: 'Otros',
};

/** [{ type, correct }] → [{ family, name, correct, total }] en orden fijo. */
export function familyStats(answers) {
  const acc = new Map();
  for (const answer of answers) {
    const family = EXERCISE_FAMILIES[answer.type] || 'libre';
    const entry = acc.get(family) || { family, name: FAMILY_NAMES[family] || family, correct: 0, total: 0 };
    entry.total += 1;
    if (answer.correct) entry.correct += 1;
    acc.set(family, entry);
  }
  return Object.keys(FAMILY_NAMES)
    .filter((family) => acc.has(family))
    .map((family) => acc.get(family));
}

/** Desglose por familia de ejercicio, con barra y fracción. */
export function familyBreakdown(answers) {
  const rows = familyStats(answers);
  if (!rows.length) return null;
  return h('div', { class: 'result-breakdown' }, rows.map((row) =>
    h('div', { class: 'result-breakdown__row' }, [
      h('div', { class: 'result-breakdown__head' }, [
        h('span', {}, [row.name]),
        h('span', { class: 'result-breakdown__value' }, [`${row.correct} / ${row.total}`]),
      ]),
      progressBar(row.total ? row.correct / row.total : 0, { label: `Aciertos en ${row.name}` }),
    ])
  ));
}

/** Nota grande de la pantalla de resultados. `score` entre 0 y 1. */
export function scoreHeadline(score, { correct, total, caption = null } = {}) {
  const level = score >= 0.8 ? 'ok' : score >= 0.6 ? 'warn' : 'err';
  return h('div', { class: `result-score result-score--${level}` }, [
    h('div', { class: 'result-score__value' }, [pct(score)]),
    h('div', { class: 'result-score__detail' }, [`${correct} / ${total} correctos`]),
    caption ? h('p', { class: 'result-score__caption' }, [caption]) : null,
  ]);
}

/** Fila de datos "etiqueta → valor" para los resúmenes. */
export function statRow(label, value) {
  return h('div', { class: 'result-stat' }, [
    h('span', { class: 'result-stat__label' }, [label]),
    h('span', { class: 'result-stat__value' }, [value]),
  ]);
}

/** Barra de botones al final de una sesión. `actions`: [{label, kind, onClick, href}] */
export function resultActions(actions) {
  return h('div', { class: 'result-actions' }, actions.filter(Boolean).map((action) =>
    action.href
      ? h('a', { class: `btn btn--block btn--${action.kind || 'secondary'} tap-target`, href: action.href }, [action.label])
      : h('button', { type: 'button', class: `btn btn--block btn--${action.kind || 'secondary'}`, onClick: action.onClick }, [action.label])
  ));
}

/** Atajo: salir de una sesión a otra ruta (usado como `onExit` del shell). */
export function exitTo(hash) {
  return () => navigate(hash);
}
