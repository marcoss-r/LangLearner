// js/screens/parts.js — piezas visuales y utilidades que comparten TODAS las
// pantallas de la Fase 3. Existe para que dos pantallas no inventen dos
// versiones distintas de la misma barra de progreso o del mismo formato de
// porcentaje. Solo depende de ui.js.
//
// Si necesitas algo que solo usa una pantalla, NO lo metas aquí: déjalo en su
// propio módulo.
import { h } from '../ui.js';

/* ---------- Navegación ---------- */

export const LANG_NAMES = { fr: 'Francés', de: 'Alemán' };
export const LANG_FLAGS = { fr: '🇫🇷', de: '🇩🇪' };

/** Cambia de ruta. Centralizado por si algún día hace falta interceptarlo. */
export function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Cabecera de pantalla. `back` es un hash ('#/') o null.
 * El botón de volver es un <a href>, no un botón con JS: así funciona el
 * gesto de retroceso del navegador y se puede abrir con pulsación larga.
 */
export function screenHeader({ title, subtitle = null, back = null, backLabel = 'Volver', actions = null } = {}) {
  return h('header', { class: 'screen-header' }, [
    back
      ? h('a', { class: 'screen-header__back tap-target', href: back }, [
          h('span', { 'aria-hidden': 'true' }, ['‹']),
          h('span', {}, [backLabel]),
        ])
      : null,
    h('div', { class: 'screen-header__main' }, [
      h('h1', { class: 'screen-header__title' }, [title]),
      subtitle ? h('p', { class: 'screen-header__subtitle' }, [subtitle]) : null,
    ]),
    actions ? h('div', { class: 'screen-header__actions' }, actions) : null,
  ]);
}

/* ---------- Formatos ---------- */

/** 0.86 → "86 %". Siempre entero: los decimales no aportan nada aquí. */
export function pct(ratio) {
  if (!Number.isFinite(ratio)) return '—';
  return `${Math.round(ratio * 100)} %`;
}

/** Milisegundos → "4 min 12 s" / "48 s". Para tiempos de clase. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `${sec} s`;
  return `${min} min ${String(sec).padStart(2, '0')} s`;
}

/** Minutos enteros → "1 h 05" / "22 min". Para totales de estudio. */
export function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** ISO → "10 ago 2026". Devuelve null si la fecha no es válida. */
export function formatDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------- Indicadores ---------- */

/**
 * Barra de progreso accesible. `ratio` entre 0 y 1.
 * `label` es obligatorio para lectores de pantalla: una barra sin etiqueta
 * no dice nada ("57 %" ¿de qué?).
 */
export function progressBar(ratio, { label, showValue = false } = {}) {
  const value = Math.max(0, Math.min(1, Number(ratio) || 0));
  const bar = h(
    'div',
    {
      class: 'progress',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(Math.round(value * 100)),
      'aria-label': label,
    },
    [h('div', { class: 'progress__fill', style: { width: `${value * 100}%` } }, [])]
  );
  if (!showValue) return bar;
  return h('div', { class: 'progress-row' }, [bar, h('span', { class: 'progress-row__value' }, [pct(value)])]);
}

/** Distintivo de nivel: A1 / A2 / B1. */
export function levelChip(level) {
  return h('span', { class: `chip chip--level chip--level-${String(level).toLowerCase()}` }, [level]);
}

/**
 * Estado de una clase a partir de su entrada en `progress.lessons[id]`
 * (o `undefined` si nunca se ha abierto).
 */
export function lessonStatusChip(entry) {
  if (!entry) return h('span', { class: 'chip' }, ['Sin empezar']);
  if (entry.status === 'done') {
    const score = pct(entry.bestScore ?? 0);
    const kind = (entry.bestScore ?? 0) >= 0.8 ? 'ok' : 'warn';
    return h('span', { class: `chip chip--${kind}` }, [`Hecha · ${score}`]);
  }
  return h('span', { class: 'chip chip--accent' }, ['Empezada']);
}

/* ---------- Estados de carga y error ---------- */

export function spinnerNode(text = 'Cargando…') {
  return h('div', { class: 'screen-loading' }, [
    h('div', { class: 'spinner', 'aria-hidden': 'true' }, []),
    h('p', { class: 'text-dim' }, [text]),
  ]);
}

export function emptyState({ icon = '📭', title, body = null, action = null } = {}) {
  return h('div', { class: 'empty-state' }, [
    h('div', { class: 'empty-state__icon', 'aria-hidden': 'true' }, [icon]),
    h('div', { class: 'empty-state__title' }, [title]),
    body ? h('p', {}, [body]) : null,
    action || null,
  ]);
}

/**
 * Bloque de error con botón de reintento. Un fallo de red al cargar un JSON
 * no puede dejar la pantalla en blanco: el usuario tiene que ver qué pasó y
 * poder volver a intentarlo sin recargar la app entera.
 */
export function errorState(err, onRetry = null) {
  return h('div', { class: 'empty-state empty-state--error' }, [
    h('div', { class: 'empty-state__icon', 'aria-hidden': 'true' }, ['⚠️']),
    h('div', { class: 'empty-state__title' }, ['No se pudo cargar']),
    h('p', {}, [err?.message || String(err)]),
    onRetry
      ? h('button', { type: 'button', class: 'btn btn--secondary', onClick: onRetry }, ['Reintentar'])
      : null,
  ]);
}

/**
 * Patrón estándar de pantalla asíncrona. `render()` del router es SÍNCRONA y
 * tiene que devolver un nodo ya; los datos llegan después.
 *
 *   export function render(params) {
 *     return asyncScreen('screen-course', () => data.loadCourse(params.lang), (course) => [...nodos]);
 *   }
 *
 * `build` puede devolver un Node o un array de Nodes. Si `load` o `build`
 * lanzan, se pinta errorState con un botón que reintenta de verdad.
 */
export function asyncScreen(className, load, build, { loadingText } = {}) {
  const el = h('div', { class: className }, [spinnerNode(loadingText)]);

  const fill = (children) => {
    el.innerHTML = '';
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child == null || child === false) continue;
      el.appendChild(child);
    }
  };

  const run = () => {
    fill(spinnerNode(loadingText));
    Promise.resolve()
      .then(load)
      .then((value) => fill(build(value)))
      .catch((err) => fill(errorState(err, run)));
  };

  run();
  return el;
}
