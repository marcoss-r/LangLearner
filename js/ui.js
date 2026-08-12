// js/ui.js — helpers de interfaz reutilizables por las pantallas.
// Ningún módulo de pantalla debe tocar el DOM "a pelo" fuera de aquí salvo
// lo estrictamente local a esa pantalla: h(), toast() y modal() cubren
// el 90% de los casos.

/**
 * Crea un elemento DOM de forma declarativa.
 * h('div', { class:'card', onClick:fn }, ['texto', h('span', {}, ['x'])])
 * - props acepta cualquier atributo HTML, además de `class`, `style` (objeto),
 *   y manejadores `onXxx` (onClick, onInput...).
 * - children acepta string, Node, o array (anidable) de ambos. Los `null`/
 *   `undefined`/`false` se ignoran, para poder escribir condicionales inline.
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class' || key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '');
    } else {
      el.setAttribute(key, value);
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(el, child);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
}

/* ---------- Toast ---------- */

let toastTimer = null;

/**
 * Muestra un mensaje breve no bloqueante.
 * kind: 'default' | 'ok' | 'err' | 'warn'
 */
export function toast(msg, kind = 'default') {
  const root = document.getElementById('toast-root');
  if (!root) return;

  root.innerHTML = '';
  const kindClass = kind && kind !== 'default' ? ` toast--${kind}` : '';
  const node = h('div', { class: `toast${kindClass}`, role: 'status' }, [msg]);
  root.appendChild(node);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (node.parentNode === root) root.removeChild(node);
  }, 2600);
}

/* ---------- Modal ---------- */

/**
 * Muestra un modal genérico.
 * modal({ title, body, actions: [{ label, kind, onClick }] }) → función close()
 * `body` puede ser texto o un Node. Si una acción no llama a close() explícitamente
 * el modal se cierra igualmente al pulsar el botón, salvo que el handler devuelva
 * `false` (por ejemplo para validar antes de cerrar).
 */
export function modal({ title, body, actions = [] } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return () => {};

  function close() {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(ev) {
    if (ev.key === 'Escape') close();
  }

  const overlay = h(
    'div',
    {
      class: 'modal-overlay',
      onClick: (ev) => { if (ev.target === overlay) close(); },
    },
    [
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
        title ? h('div', { class: 'modal__title' }, [title]) : null,
        body ? h('div', { class: 'modal__body selectable' }, [body]) : null,
        h(
          'div',
          { class: 'modal__actions' },
          actions.map((action) =>
            h(
              'button',
              {
                class: `btn btn--block btn--${action.kind || 'secondary'}`,
                onClick: () => {
                  const result = action.onClick ? action.onClick() : undefined;
                  if (result !== false) close();
                },
              },
              [action.label]
            )
          )
        ),
      ]),
    ]
  );

  root.appendChild(overlay);
  document.addEventListener('keydown', onKeydown);
  return close;
}

/**
 * Diálogo de confirmación simple. Devuelve una promesa que resuelve a
 * true/false según lo que pulse el usuario.
 */
export function confirmDialog({ title = '¿Seguro?', body = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      body,
      actions: [
        {
          label: confirmLabel,
          kind: danger ? 'danger' : 'primary',
          onClick: () => resolve(true),
        },
        {
          label: cancelLabel,
          kind: 'ghost',
          onClick: () => resolve(false),
        },
      ],
    });
  });
}

/* ---------- Barra de caracteres especiales ---------- */

const ACCENT_CHARS = {
  fr: ['é', 'è', 'ê', 'à', 'â', 'ç', 'î', 'ô', 'ù', 'û'],
  de: ['ä', 'ö', 'ü', 'ß'],
};

/**
 * Crea (o reutiliza) la barra de caracteres especiales asociada a un input,
 * y la muestra al enfocarlo. Inserta el carácter en la posición del cursor,
 * imprescindible porque el teclado en español obliga a mantener pulsado
 * cada tecla para acceder a estos caracteres.
 *
 * accentBar(inputEl, 'fr') → HTMLElement de la barra (insértala tú donde
 * quieras en el layout, normalmente justo debajo del input).
 */
export function accentBar(inputEl, lang) {
  const chars = ACCENT_CHARS[lang] || [];
  const bar = h(
    'div',
    { class: 'accent-bar', hidden: true },
    chars.map((ch) =>
      h(
        'button',
        {
          type: 'button',
          class: 'accent-bar__key',
          // pointerdown, no click: en iOS el evento mousedown se dispara DESPUÉS
          // del touchend, así que preventDefault sobre mousedown llega tarde y el
          // input ya ha perdido el foco (el teclado se cierra de golpe). Con
          // pointerdown + preventDefault el foco se mantiene, y la inserción se
          // hace aquí mismo para no depender de un click que puede no llegar.
          onPointerdown: (ev) => {
            ev.preventDefault();
            insertAtCursor(inputEl, ch);
          },
        },
        [ch]
      )
    )
  );

  inputEl.addEventListener('focus', () => { bar.hidden = false; });
  inputEl.addEventListener('blur', () => {
    // Pequeño margen para que el mousedown del botón se procese antes de ocultar.
    setTimeout(() => { bar.hidden = true; }, 150);
  });

  return bar;
}

function insertAtCursor(inputEl, text) {
  const start = inputEl.selectionStart ?? inputEl.value.length;
  const end = inputEl.selectionEnd ?? inputEl.value.length;
  const value = inputEl.value;
  inputEl.value = value.slice(0, start) + text + value.slice(end);
  const cursor = start + text.length;
  inputEl.focus();
  inputEl.setSelectionRange(cursor, cursor);
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}
