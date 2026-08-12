// js/app.js — bootstrap de la aplicación: registro del Service Worker,
// router por hash, montaje/desmontaje de pantallas y estado de la tab bar.
import { render as renderHome } from './screens/home.js';
import { render as renderCourse } from './screens/course.js';
import { render as renderLesson } from './screens/lesson.js';
import { render as renderExam } from './screens/exam.js';
import { render as renderReview } from './screens/review.js';
import { render as renderStats } from './screens/stats.js';
import { render as renderSettings } from './screens/settings.js';
import { render as renderDev } from './screens/dev.js';
import * as store from './store.js';
import * as data from './data.js';
import * as srs from './srs.js';
import * as audio from './audio.js';
import * as grader from './grader.js';

// Rutas soportadas. Se comprueban en orden; la primera que casa gana.
// Los `:param` se capturan por posición de segmento.
const ROUTES = [
  { pattern: '#/', segments: [], render: renderHome, tab: '#/' },
  { pattern: '#/course/:lang', segments: ['course', ':lang'], render: renderCourse, tab: '#/' },
  { pattern: '#/lesson/:id', segments: ['lesson', ':id'], render: renderLesson, tab: null },
  { pattern: '#/exam/:id', segments: ['exam', ':id'], render: renderExam, tab: null },
  { pattern: '#/review', segments: ['review'], render: renderReview, tab: '#/review' },
  { pattern: '#/stats', segments: ['stats'], render: renderStats, tab: '#/stats' },
  { pattern: '#/settings', segments: ['settings'], render: renderSettings, tab: '#/settings' },
  // Pantalla oculta de pruebas del motor de ejercicios (Fase 2). Sin tab: no
  // forma parte de la navegación normal, solo se llega escribiendo la URL.
  { pattern: '#/dev/exercises', segments: ['dev', 'exercises'], render: renderDev, tab: null },
];

const DEFAULT_ROUTE = '#/';

function parseHash(hash) {
  // Normaliza: sin hash, '#', o cualquier cosa vacía → ruta raíz.
  const clean = (hash || '').replace(/^#\/?/, '');
  const parts = clean.split('/').filter(Boolean);

  for (const route of ROUTES) {
    if (route.segments.length !== parts.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i];
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(parts[i]);
      } else if (seg !== parts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

function setActiveTab(tabHash) {
  const items = document.querySelectorAll('.tabbar__item');
  items.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.route === tabHash);
  });
}

function setTabbarVisible(visible) {
  const tabbar = document.querySelector('.app-tabbar');
  if (tabbar) tabbar.classList.toggle('is-hidden', !visible);
}

function mountScreen(el) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  app.appendChild(el);
  // Cada navegación empieza con el scroll arriba del todo.
  app.scrollTop = 0;
}

function routeChanged() {
  const hash = window.location.hash || DEFAULT_ROUTE;
  const matched = parseHash(hash);

  if (!matched) {
    // Ruta desconocida → redirige a home.
    window.location.hash = DEFAULT_ROUTE;
    return;
  }

  const { route, params } = matched;
  const el = route.render(params);
  mountScreen(el);
  setActiveTab(route.tab);
  setTabbarVisible(route.tab !== null);
}

function initRouter() {
  window.addEventListener('hashchange', routeChanged);
  routeChanged();
}

// La síntesis de voz de iOS se queda colgada si el móvil se bloquea o se
// cambia de app a mitad de una locución. No hay forma de recuperarla salvo
// cancelarla al volver a primer plano.
function initSpeechCancelOnHide() {
  document.addEventListener('visibilitychange', () => {
    if (!('speechSynthesis' in window)) return;
    // Se cancela en los dos sentidos a propósito: al ocultar, para que no quede
    // una locución a medias; y al volver, porque Safari puede reaparecer con la
    // cola en un estado "hablando" del que ya no sale sin un cancel().
    window.speechSynthesis.cancel();
  });
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
      console.error('No se pudo registrar el Service Worker.', err);
    });
  });
}

function boot() {
  initServiceWorker();
  initSpeechCancelOnHide();
  initRouter();
}

// Puente de depuración: permite probar store/data/srs/audio/grader desde la
// consola de Safari en el iPhone, donde no hay DevTools con acceso al código
// fuente. Ej.: `await LL.data.loadLesson('fr-a1-001')`.
window.LL = { store, data, srs, audio, grader };

boot();
