// js/screens/home.js — pantalla "Aprender" (#/), la portada de la app.
// Muestra, para el idioma activo: por dónde seguir, progreso por nivel,
// acceso a los exámenes y el aviso de repaso pendiente.
import { h } from '../ui.js';
import * as data from '../data.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import {
  screenHeader,
  progressBar,
  levelChip,
  spinnerNode,
  errorState,
  emptyState,
  navigate,
  LANG_NAMES,
  LANG_FLAGS,
} from './parts.js';

export function render() {
  const wrap = h('div', { class: 'screen-home' }, []);
  let lang = store.getSettings().activeLang === 'de' ? 'de' : 'fr';

  const switcherHost = h('div', {}, []);
  const bodyHost = h('div', { class: 'home-body' }, []);

  function paintSwitcher() {
    switcherHost.innerHTML = '';
    switcherHost.appendChild(langSwitcher(lang, (next) => {
      if (next === lang) return;
      lang = next;
      store.updateSettings({ activeLang: lang });
      paintSwitcher();
      loadBody();
    }));
  }

  function loadBody() {
    bodyHost.innerHTML = '';
    bodyHost.appendChild(spinnerNode('Cargando tu curso…'));
    Promise.resolve()
      .then(() => data.loadCourse(lang))
      .then((course) => {
        bodyHost.innerHTML = '';
        for (const node of buildHome(lang, course)) {
          if (node) bodyHost.appendChild(node);
        }
      })
      .catch((err) => {
        bodyHost.innerHTML = '';
        bodyHost.appendChild(errorState(err, loadBody));
      });
  }

  paintSwitcher();
  loadBody();

  wrap.appendChild(screenHeader({ title: 'Aprender' }));
  wrap.appendChild(switcherHost);
  wrap.appendChild(bodyHost);
  return wrap;
}

/** Selector FR/DE. Cambiar de idioma persiste el ajuste y repinta el cuerpo. */
function langSwitcher(active, onChange) {
  return h(
    'div',
    { class: 'lang-switcher', role: 'tablist', 'aria-label': 'Idioma activo' },
    ['fr', 'de'].map((code) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(code === active),
          class: `lang-switcher__btn tap-target${code === active ? ' is-active' : ''}`,
          onClick: () => onChange(code),
        },
        [
          h('span', { 'aria-hidden': 'true' }, [LANG_FLAGS[code]]),
          h('span', {}, [LANG_NAMES[code]]),
        ]
      )
    )
  );
}

function buildHome(lang, course) {
  const progress = store.getProgress(lang);
  const lessons = [...(course.lessons || [])].sort((a, b) => a.order - b.order);
  const levels = course.levels || [];

  return [
    continueCard(lang, course, lessons, progress),
    levelsCard(lang, lessons, levels, progress),
    examsCard(lang, levels),
    reviewCard(lang),
    courseLinkNode(lang, lessons, levels),
  ];
}

/* ---------- Tarjeta "Continúa por aquí" ---------- */

function continueCard(lang, course, lessons, progress) {
  if (lessons.length === 0) {
    return h('section', { class: 'card home-continue' }, [
      h('h2', { class: 'card__title' }, ['Continúa por aquí']),
      emptyState({
        icon: '🚧',
        title: 'Todavía no hay clases publicadas',
        body: `El curso de ${LANG_NAMES[lang]} está en construcción. Vuelve pronto.`,
      }),
    ]);
  }

  const next = lessons.find((l) => progress.lessons[l.id]?.status !== 'done');

  if (!next) {
    // Todo lo publicado está hecho: propone repaso o el examen del nivel más alto.
    const due = srs.dueCards(store.getSrsCards(lang).cards).length;
    const topLevel = (course.levels || [])[course.levels.length - 1];
    return h('section', { class: 'card home-continue home-continue--done' }, [
      h('h2', { class: 'card__title' }, ['¡Al día!']),
      h('p', { class: 'text-dim' }, ['Has completado todas las clases publicadas de este idioma.']),
      h('div', { class: 'home-continue__actions' }, [
        due > 0
          ? h('a', { class: 'btn btn--primary btn--block', href: '#/review' }, [`Repasar ${due} tarjeta${due === 1 ? '' : 's'}`])
          : null,
        topLevel
          ? h('a', { class: 'btn btn--secondary btn--block', href: `#/exam/${topLevel.exam}` }, [`Prueba de nivel ${topLevel.id}`])
          : null,
      ]),
    ]);
  }

  const block = (course.blocks || []).find((b) => b.id === next.block);
  const entry = progress.lessons[next.id];

  return h('a', { class: 'card card--interactive home-continue', href: `#/lesson/${next.id}` }, [
    h('div', { class: 'home-continue__eyebrow' }, [entry ? 'Sigue por aquí' : 'Continúa por aquí']),
    h('h2', { class: 'card__title' }, [next.title]),
    next.subtitle ? h('p', { class: 'card__subtitle' }, [next.subtitle]) : null,
    h('div', { class: 'home-continue__meta' }, [
      levelChip(next.level),
      block ? h('span', { class: 'chip' }, [block.name]) : null,
      h('span', { class: 'chip' }, [`⏱ ${next.estimatedMinutes ?? '?'} min`]),
    ]),
    h('span', { class: 'btn btn--primary btn--block home-continue__cta' }, [entry ? 'Continuar clase' : 'Empezar clase']),
  ]);
}

/* ---------- Progreso por nivel ---------- */

function levelsCard(lang, lessons, levels, progress) {
  if (levels.length === 0) return null;

  const doneByLevel = { A1: 0, A2: 0, B1: 0 };
  for (const l of lessons) {
    if (progress.lessons[l.id]?.status === 'done') {
      doneByLevel[l.level] = (doneByLevel[l.level] || 0) + 1;
    }
  }

  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Progreso por nivel']),
    h(
      'div',
      { class: 'home-levels' },
      levels.map((lv) => {
        const total = lv.range[1] - lv.range[0] + 1;
        const done = doneByLevel[lv.id] || 0;
        return h('div', { class: 'home-level-row' }, [
          h('div', { class: 'home-level-row__head' }, [
            levelChip(lv.id),
            h('span', { class: 'text-dim' }, [`${done} / ${total} clases`]),
          ]),
          progressBar(total > 0 ? done / total : 0, { label: `Progreso en ${lv.id}` }),
        ]);
      })
    ),
  ]);
}

/* ---------- Exámenes ---------- */

function examsCard(lang, levels) {
  if (levels.length === 0) return null;
  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Pruebas de nivel']),
    h(
      'div',
      { class: 'row-list' },
      levels.map((lv) =>
        h('a', { class: 'row tap-target', href: `#/exam/${lv.exam}` }, [
          h('div', { class: 'row__main' }, [
            h('div', { class: 'row__title' }, [`Prueba de nivel ${lv.id}`]),
            h('div', { class: 'row__meta' }, [lv.name]),
          ]),
          h('span', { 'aria-hidden': 'true' }, ['›']),
        ])
      )
    ),
  ]);
}

/* ---------- Repaso pendiente ---------- */

function reviewCard(lang) {
  const due = srs.dueCards(store.getSrsCards(lang).cards).length;
  return h('a', { class: 'card card--interactive home-review', href: '#/review' }, [
    h('div', { class: 'home-review__main' }, [
      h('h2', { class: 'card__title' }, ['Repasar hoy']),
      h('p', { class: 'text-dim' }, [
        due > 0
          ? `Tienes ${due} tarjeta${due === 1 ? '' : 's'} para repasar.`
          : 'Hoy no tienes tarjetas pendientes de repaso. Vuelve cuando venzan.',
      ]),
    ]),
    h('span', { class: `chip ${due > 0 ? 'chip--accent' : ''}` }, [String(due)]),
  ]);
}

/* ---------- Enlace al curso completo ---------- */

function courseLinkNode(lang, lessons, levels) {
  // `planned` es el tamaño final del curso (250) y `published` lo que hay hoy.
  // Prometer "ver las 250 clases" cuando solo hay una publicada es mentir:
  // mientras el curso se esté escribiendo, manda la cifra real.
  const planned = levels.length ? levels[levels.length - 1].range[1] : 0;
  const published = lessons.length;
  return h('a', { class: 'row tap-target home-course-link', href: `#/course/${lang}` }, [
    h('div', { class: 'row__main' }, [
      h('div', { class: 'row__title' }, ['Ver todas las clases']),
      h('div', { class: 'row__meta' }, [
        published < planned
          ? `${published} publicadas de ${planned} previstas`
          : `Las ${published} clases, por nivel y bloque`,
      ]),
    ]),
    h('span', { 'aria-hidden': 'true' }, ['›']),
  ]);
}
