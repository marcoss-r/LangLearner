// js/screens/course.js — pantalla "Curso" (#/course/:lang).
// Lista completa de clases agrupada por nivel y bloque, con buscador y
// filtros. Con 250 filas en la Fase 5 esto tiene que ir fluido: el buscador
// y los filtros solo repintan `listHost`, nunca la pantalla entera, y cada
// fila lleva `content-visibility: auto` (ver css/screens.css).
import { h } from '../ui.js';
import * as data from '../data.js';
import * as store from '../store.js';
import { screenHeader, asyncScreen, levelChip, lessonStatusChip, emptyState, LANG_NAMES } from './parts.js';

// Etiquetas legibles para los `kind` de clase. La lista de valores posibles
// SIEMPRE sale de los datos (ver `kinds` en buildCourse): esto solo traduce
// los que ya conocemos a un texto más natural que el crudo del JSON.
const KIND_LABELS = {
  vocabulario: 'Vocabulario',
  gramatica: 'Gramática',
  fonetica: 'Fonética',
  cultura: 'Cultura',
  conversacion: 'Conversación',
  repaso: 'Repaso',
  escritura: 'Escritura',
};

function kindLabel(kind) {
  return KIND_LABELS[kind] || (kind ? kind[0].toUpperCase() + kind.slice(1) : 'General');
}

/** Quita tildes y pasa a minúsculas para una búsqueda que no dependa de acentos. */
function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function render(params = {}) {
  const lang = params.lang === 'de' ? 'de' : 'fr';
  return asyncScreen('screen-course', () => data.loadCourse(lang), (course) => buildCourse(lang, course), {
    loadingText: 'Cargando el curso…',
  });
}

function buildCourse(lang, course) {
  const progress = store.getProgress(lang);
  const lessons = course.lessons || [];

  if (lessons.length === 0) {
    return [
      screenHeader({ title: 'Curso', subtitle: LANG_NAMES[lang], back: '#/' }),
      emptyState({
        icon: '📚',
        title: 'Todavía no hay clases',
        body: `El curso de ${LANG_NAMES[lang]} está en construcción. Vuelve pronto.`,
      }),
    ];
  }

  // Los tipos disponibles salen de los datos, nunca de una lista fija: si
  // mañana aparece un `kind` nuevo, el filtro lo recoge solo.
  const kinds = [...new Set(lessons.map((l) => l.kind).filter(Boolean))].sort();

  const state = { q: '', level: '', kind: '', onlyPending: false };
  const listHost = h('div', { class: 'course-list' }, []);

  function paintList() {
    const filtered = filterLessons(lessons, progress, state);
    listHost.innerHTML = '';
    if (filtered.length === 0) {
      listHost.appendChild(
        emptyState({ icon: '🔍', title: 'Sin resultados', body: 'Prueba a cambiar la búsqueda o los filtros.' })
      );
      return;
    }
    listHost.appendChild(renderGrouped(lang, course, filtered));
  }

  paintList();

  return [
    screenHeader({ title: 'Curso', subtitle: `${LANG_NAMES[lang]} · ${lessons.length} clase${lessons.length === 1 ? '' : 's'} publicada${lessons.length === 1 ? '' : 's'}`, back: '#/' }),
    searchAndFilters(state, kinds, paintList),
    listHost,
  ];
}

function filterLessons(lessons, progress, state) {
  const q = normalize(state.q);
  return lessons
    .filter((l) => {
      if (state.level && l.level !== state.level) return false;
      if (state.kind && l.kind !== state.kind) return false;
      if (state.onlyPending && progress.lessons[l.id]?.status === 'done') return false;
      if (q) {
        const haystack = normalize([l.title, l.subtitle, ...(l.tags || [])].filter(Boolean).join(' '));
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

function searchAndFilters(state, kinds, onChange) {
  const searchInput = h('input', {
    type: 'search',
    class: 'course-search',
    placeholder: 'Buscar por título o etiqueta',
    value: state.q,
    autocapitalize: 'off',
    autocorrect: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    onInput: (ev) => {
      state.q = ev.target.value;
      onChange();
    },
  });

  const levelSelect = h(
    'select',
    {
      class: 'course-filter',
      'aria-label': 'Filtrar por nivel',
      onChange: (ev) => {
        state.level = ev.target.value;
        onChange();
      },
    },
    [
      h('option', { value: '' }, ['Todos los niveles']),
      ...['A1', 'A2', 'B1'].map((lv) => h('option', { value: lv }, [lv])),
    ]
  );

  const kindSelect = h(
    'select',
    {
      class: 'course-filter',
      'aria-label': 'Filtrar por tipo',
      onChange: (ev) => {
        state.kind = ev.target.value;
        onChange();
      },
    },
    [h('option', { value: '' }, ['Todos los tipos']), ...kinds.map((k) => h('option', { value: k }, [kindLabel(k)]))]
  );

  const pendingToggle = h('label', { class: 'course-toggle tap-target' }, [
    h('input', {
      type: 'checkbox',
      onChange: (ev) => {
        state.onlyPending = ev.target.checked;
        onChange();
      },
    }),
    h('span', {}, ['Solo pendientes']),
  ]);

  return h('div', { class: 'course-filters' }, [
    searchInput,
    h('div', { class: 'course-filters__row' }, [levelSelect, kindSelect, pendingToggle]),
  ]);
}

/** Agrupa por nivel y, dentro, por bloque; solo pinta lo que tenga alguna fila. */
function renderGrouped(lang, course, filtered) {
  const progress = store.getProgress(lang);
  const container = h('div', { class: 'course-groups' }, []);

  for (const level of course.levels || []) {
    const levelLessons = filtered.filter((l) => l.level === level.id);
    if (levelLessons.length === 0) continue;

    container.appendChild(
      h('h2', { class: 'course-level-title' }, [levelChip(level.id), h('span', {}, [level.name])])
    );

    const blocksInLevel = (course.blocks || []).filter((b) => b.level === level.id);
    const seen = new Set();

    for (const block of blocksInLevel) {
      const blockLessons = levelLessons.filter((l) => l.block === block.id);
      if (blockLessons.length === 0) continue;
      blockLessons.forEach((l) => seen.add(l.id));

      container.appendChild(
        h('h3', { class: 'course-block-title' }, [
          block.name,
          h('span', { class: 'text-dim' }, [` · clases ${block.range[0]}–${block.range[1]}`]),
        ])
      );
      container.appendChild(h('div', { class: 'row-list' }, blockLessons.map((l) => lessonRow(l, progress))));
    }

    // Clases del nivel que no encajan en ningún bloque conocido (currículo
    // aún incompleto): se listan igualmente, sin perderlas de la búsqueda.
    const orphan = levelLessons.filter((l) => !seen.has(l.id));
    if (orphan.length) {
      container.appendChild(h('div', { class: 'row-list' }, orphan.map((l) => lessonRow(l, progress))));
    }

    container.appendChild(
      h('a', { class: 'row course-exam-row tap-target', href: `#/exam/${level.exam}` }, [
        h('span', { 'aria-hidden': 'true' }, ['📝']),
        h('div', { class: 'row__main' }, [
          h('div', { class: 'row__title' }, [`Prueba de nivel ${level.id}`]),
          h('div', { class: 'row__meta' }, ['Sin explicaciones, solo ejercicios']),
        ]),
        h('span', { 'aria-hidden': 'true' }, ['›']),
      ])
    );
  }

  return container;
}

function lessonRow(l, progress) {
  const entry = progress.lessons[l.id];
  return h('a', { class: 'row course-row tap-target', href: `#/lesson/${l.id}` }, [
    h('div', { class: 'row__main' }, [
      h('div', { class: 'course-row__top' }, [
        h('span', { class: 'text-dim' }, [`#${l.order}`]),
        h('span', { class: 'row__title' }, [l.title]),
      ]),
      l.subtitle ? h('div', { class: 'row__meta' }, [l.subtitle]) : null,
      h('div', { class: 'course-row__chips' }, [
        h('span', { class: 'chip' }, [kindLabel(l.kind)]),
        ...(l.tags || []).slice(0, 3).map((t) => h('span', { class: 'chip' }, [t])),
      ]),
    ]),
    lessonStatusChip(entry),
  ]);
}
