// js/screens/dev.js — pantalla oculta de pruebas del motor de ejercicios
// (Fase 2, criterio de aceptación visual). Carga fr-a1-001.json entero y
// renderiza sus ejercicios uno detrás de otro con un botón "Comprobar" cada
// uno y un contador de aciertos arriba. Ruta: #/dev/exercises, tab: null.
// Es también la herramienta de trabajo del agente que implemente los 8 tipos
// restantes: aquí verá sus renderers en contexto real.
import { h, toast } from '../ui.js';
import * as data from '../data.js';
import * as store from '../store.js';
import * as audio from '../audio.js';
import { renderExercise, EXERCISE_FAMILIES } from '../exercises/index.js';

const LESSON_ID = 'fr-a1-001';

export function render() {
  const el = h('div', { class: 'screen-dev' }, [
    h('h1', {}, ['Banco de pruebas — ejercicios']),
    h('p', { class: 'text-dim' }, [`Cargando ${LESSON_ID}…`]),
  ]);

  loadAndMount(el);
  return el;
}

function buildCtx(lesson) {
  const settings = store.getSettings();
  const lang = lesson.lang;
  const voiceURI = lang === 'fr' ? settings.ttsVoiceFr : settings.ttsVoiceDe;

  const speakSafe = (fn, text) =>
    fn(text, { lang, rate: settings.ttsRate, voiceURI }).catch((err) => {
      toast(err.message, 'err');
    });

  return {
    lang,
    settings,
    speak: (text) => speakSafe(audio.speak, text),
    speakSlow: (text) => speakSafe(audio.speakSlow, text),
    onAnswered: () => {},
  };
}

async function loadAndMount(root) {
  let lesson;
  try {
    lesson = await data.loadLesson(LESSON_ID);
  } catch (err) {
    root.innerHTML = '';
    root.appendChild(
      h('div', { class: 'empty-state' }, [
        h('div', { class: 'empty-state__icon', 'aria-hidden': 'true' }, ['⚠️']),
        h('div', { class: 'empty-state__title' }, [`No se pudo cargar ${LESSON_ID}`]),
        h('p', {}, [err.message]),
      ])
    );
    return;
  }

  const ctx = buildCtx(lesson);

  let correctCount = 0;
  let checkedCount = 0;
  const scoreLabel = h('span', {}, ['0 / 0']);
  const counter = h('div', { class: 'card' }, [
    h('p', {}, [h('strong', {}, ['Aciertos: ']), scoreLabel]),
    h('p', { class: 'text-dim' }, [`${lesson.exercises.length} ejercicios en total.`]),
  ]);

  const list = h('div', { class: 'ex-dev-list' }, []);

  lesson.exercises.forEach((exercise, i) => {
    const instance = renderExercise(exercise, ctx);

    const checkBtn = h('button', { type: 'button', class: 'btn btn--primary' }, ['Comprobar']);
    const revealBtn = h('button', { type: 'button', class: 'btn btn--ghost' }, ['Revelar']);
    checkBtn.disabled = !instance.canCheck();
    let done = false;

    // El contrato no incluye un callback de "ha cambiado la respuesta": para
    // esta pantalla de pruebas basta con reevaluar canCheck() en cada toque.
    // Delegar en `document` (no en instance.el) es imprescindible: fill_blank
    // en modo banco abre su selector con modal() de ui.js, que se monta en
    // #modal-root, fuera del propio `el` del ejercicio, así que un clic ahí
    // no burbujea hasta instance.el.
    //
    // 'input' además de 'click': los tipos de escritura (traducción,
    // conjugación, diálogo, dictado, corrección de errores) solo pasan a ser
    // comprobables al teclear, y sin esto el botón se quedaba deshabilitado
    // para siempre. La pantalla de clase de la Fase 3 debe escuchar los dos.
    const refresh = () => { if (!done) checkBtn.disabled = !instance.canCheck(); };
    document.addEventListener('click', refresh);
    document.addEventListener('input', refresh);

    checkBtn.addEventListener('click', () => {
      const result = instance.check();
      done = true;
      checkBtn.disabled = true;
      revealBtn.disabled = true;
      checkedCount += 1;
      if (result.correct) correctCount += 1;
      scoreLabel.textContent = `${correctCount} / ${checkedCount}`;
    });

    revealBtn.addEventListener('click', () => {
      instance.reveal();
      done = true;
      checkBtn.disabled = true;
      revealBtn.disabled = true;
    });

    const card = h('div', { class: 'card ex-dev-item' }, [
      h('div', { class: 'ex-dev-item__meta' }, [
        h('span', { class: 'chip chip--accent' }, [`${i + 1}. ${exercise.type}`]),
        h('span', { class: 'chip' }, [EXERCISE_FAMILIES[exercise.type] || 'libre']),
        h('span', { class: 'chip' }, [exercise.id]),
        instance.isSelfAssessed ? h('span', { class: 'chip chip--warn' }, ['autoevaluado']) : null,
      ]),
      instance.el,
      h('div', { class: 'ex-dev-item__actions' }, [checkBtn, revealBtn]),
    ]);

    list.appendChild(card);
  });

  root.innerHTML = '';
  root.appendChild(
    h('div', {}, [h('h1', {}, ['Banco de pruebas — ejercicios']), counter, list])
  );
}
