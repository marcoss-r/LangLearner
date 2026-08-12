// js/store.js — único módulo que toca `localStorage` (PLAN.md §3 y §6).
// Prefijo de todas las claves: `ll:v1:`. Toda lectura va envuelta en
// try/catch y devuelve un valor por defecto si el JSON está corrupto.
//
// Regla dura: todo escritor lee el estado fresco justo antes de escribir y
// hace *merge* sobre él -- nunca reemplaza el objeto raíz. Como JS es
// monohilo, leer-modificar-escribir dentro de la misma llamada síncrona basta
// para que dos pantallas abiertas en la misma pestaña no se pisen entre sí.

import { todayKey, addLessonCards } from './srs.js';

const PREFIX = 'll:v1:';
const KEY_SETTINGS = `${PREFIX}settings`;
const KEY_ACTIVITY = `${PREFIX}activity`;
const keyProgress = (lang) => `${PREFIX}progress:${lang}`;
const keySrs = (lang) => `${PREFIX}srs:${lang}`;
const keyAnswers = (lang) => `${PREFIX}answers:${lang}`;

const DEFAULT_SETTINGS = {
  activeLang: 'fr',
  ttsRate: 0.9,
  ttsVoiceFr: null,
  ttsVoiceDe: null,
  showIpa: true,
  showEsApprox: true,
  autoPlayAudio: true,
  dailyGoalMin: 15,
};

function readKey(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    // JSON corrupto, localStorage no disponible (modo privado)... el valor
    // por defecto es siempre preferible a romper la pantalla.
    return fallback;
  }
}

function writeKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cuota superada o almacenamiento no disponible: no hay nada más que
    // hacer aquí: el módulo no lanza para no romper el flujo de la pantalla.
  }
}

/* ---------- Ajustes ---------- */

export function getSettings() {
  const stored = readKey(KEY_SETTINGS, null);
  const valid = stored && typeof stored === 'object' ? stored : {};
  return { ...DEFAULT_SETTINGS, ...valid };
}

export function updateSettings(patch) {
  const next = { ...getSettings(), ...(patch || {}) };
  writeKey(KEY_SETTINGS, next);
  return next;
}

/* ---------- Progreso por idioma ---------- */

function defaultProgress() {
  return { lessons: {}, exams: {} };
}

export function getProgress(lang) {
  const stored = readKey(keyProgress(lang), null);
  if (!stored || typeof stored !== 'object') return defaultProgress();
  return {
    lessons: stored.lessons && typeof stored.lessons === 'object' ? stored.lessons : {},
    exams: stored.exams && typeof stored.exams === 'object' ? stored.exams : {},
  };
}

export function markLessonStarted(lang, lessonId) {
  const progress = getProgress(lang);
  const existing = progress.lessons[lessonId];
  progress.lessons[lessonId] = {
    status: existing?.status === 'done' ? 'done' : 'started',
    bestScore: existing?.bestScore ?? 0,
    attempts: existing?.attempts ?? 0,
    lastAt: new Date().toISOString(),
    sectionsRead: existing?.sectionsRead ?? false,
  };
  writeKey(keyProgress(lang), progress);
  return progress.lessons[lessonId];
}

/**
 * Marca que ya se ha leído la teoría de la clase. Se llama al pasar de las
 * secciones a los ejercicios, no al completar la clase: es lo que permite
 * ofrecer "Ir directo a los ejercicios" a quien vuelve a entrar. Sin esto,
 * `sectionsRead` solo se ponía a true dentro de markLessonDone y el atajo no
 * aparecía hasta haber terminado la clase entera al menos una vez.
 */
export function markSectionsRead(lang, lessonId) {
  const progress = getProgress(lang);
  const existing = progress.lessons[lessonId];
  progress.lessons[lessonId] = {
    status: existing?.status === 'done' ? 'done' : 'started',
    bestScore: existing?.bestScore ?? 0,
    attempts: existing?.attempts ?? 0,
    lastAt: new Date().toISOString(),
    sectionsRead: true,
    ...(existing?.lastDurationMs != null ? { lastDurationMs: existing.lastDurationMs } : {}),
  };
  writeKey(keyProgress(lang), progress);
  return progress.lessons[lessonId];
}

export function markLessonDone(lang, lessonId, { score = 0, durationMs = 0 } = {}) {
  const progress = getProgress(lang);
  const existing = progress.lessons[lessonId] || {
    status: 'started',
    bestScore: 0,
    attempts: 0,
    lastAt: null,
    sectionsRead: false,
  };
  progress.lessons[lessonId] = {
    status: 'done',
    // Nunca se sobrescribe una nota mejor de un intento anterior.
    bestScore: Math.max(existing.bestScore ?? 0, score),
    attempts: (existing.attempts ?? 0) + 1,
    lastAt: new Date().toISOString(),
    sectionsRead: true,
    lastDurationMs: durationMs,
  };
  writeKey(keyProgress(lang), progress);
  return progress.lessons[lessonId];
}

export function recordExam(lang, examId, { score = 0, byTag = {} } = {}) {
  const progress = getProgress(lang);
  const existing = progress.exams[examId] || { bestScore: 0, attempts: 0, lastAt: null, byTag: {} };
  progress.exams[examId] = {
    bestScore: Math.max(existing.bestScore ?? 0, score),
    attempts: (existing.attempts ?? 0) + 1,
    lastAt: new Date().toISOString(),
    // El desglose por tag que se guarda es el del intento más reciente:
    // es el que mejor refleja el nivel actual, no el histórico.
    byTag: { ...byTag },
  };
  writeKey(keyProgress(lang), progress);
  return progress.exams[examId];
}

/* ---------- Precisión por tipo de ejercicio y por tag ---------- */
// No está en el modelo de localStorage de PLAN.md §6 con clave propia, pero
// hace falta un sitio donde acumular estos contadores para poder responder
// getStats(). Vive en su propia clave `ll:v1:answers:<lang>` para no mezclar
// contadores de precisión con el progreso por clase.

function defaultAnswers() {
  return { byType: {}, byTag: {} };
}

export function recordAnswer(lang, { type, tags = [], correct } = {}) {
  const stored = readKey(keyAnswers(lang), null);
  const data = stored && typeof stored === 'object'
    ? { byType: stored.byType || {}, byTag: stored.byTag || {} }
    : defaultAnswers();

  if (type) {
    const entry = data.byType[type] || { correct: 0, total: 0 };
    entry.total += 1;
    if (correct) entry.correct += 1;
    data.byType[type] = entry;
  }

  for (const tag of tags || []) {
    const entry = data.byTag[tag] || { correct: 0, total: 0 };
    entry.total += 1;
    if (correct) entry.correct += 1;
    data.byTag[tag] = entry;
  }

  writeKey(keyAnswers(lang), data);
  return data;
}

/* ---------- Actividad diaria ---------- */

export function getActivity() {
  const stored = readKey(KEY_ACTIVITY, null);
  return stored && typeof stored === 'object' ? stored : {};
}

export function addActivity({ minutes = 0, exercises = 0, correct = 0, lang } = {}) {
  const activity = getActivity();
  // Clave del día en hora LOCAL (no UTC): con UTC, un usuario en España
  // podría ver sus minutos de las 00:00-01:00 apuntados al día anterior.
  const day = todayKey();
  const existing = activity[day] || { minutes: 0, exercises: 0, correct: 0, lang: {} };
  existing.minutes += minutes;
  existing.exercises += exercises;
  existing.correct += correct;
  if (lang) existing.lang = { ...existing.lang, [lang]: (existing.lang?.[lang] || 0) + minutes };
  activity[day] = existing;
  writeKey(KEY_ACTIVITY, activity);
  return activity[day];
}

/* ---------- Repaso espaciado (persistencia; el cálculo vive en srs.js) ---------- */

function defaultSrs() {
  return { cards: {} };
}

export function getSrsCards(lang) {
  const stored = readKey(keySrs(lang), null);
  if (!stored || typeof stored !== 'object' || !stored.cards || typeof stored.cards !== 'object') {
    return defaultSrs();
  }
  return { cards: stored.cards };
}

/** Guarda una única tarjeta (tras calificarla con srs.grade()). */
export function saveSrsCard(lang, cardKey, card) {
  const data = getSrsCards(lang);
  data.cards = { ...data.cards, [cardKey]: card };
  writeKey(keySrs(lang), data);
  return data.cards;
}

/** Añade las tarjetas nuevas de una clase recién completada (srs.addLessonCards). */
export function addSrsCardsForLesson(lang, lessonId, srsItems) {
  const data = getSrsCards(lang);
  const merged = addLessonCards(data.cards, lessonId, srsItems);
  writeKey(keySrs(lang), { cards: merged });
  return merged;
}

/* ---------- Estadísticas agregadas (pantalla Progreso) ---------- */

export function getStats(lang) {
  const progress = getProgress(lang);
  const answers = readKey(keyAnswers(lang), null);
  const byType = (answers && answers.byType) || {};
  const byTag = (answers && answers.byTag) || {};

  const lessonsCompletedByLevel = { A1: 0, A2: 0, B1: 0 };
  let totalLessonsCompleted = 0;
  // El id de clase codifica el nivel (`fr-a1-012`), así que no hace falta
  // cargar course.json solo para saber a qué nivel pertenece cada una.
  const levelPattern = /^[a-z]{2}-(a1|a2|b1)-\d+$/i;
  for (const [lessonId, entry] of Object.entries(progress.lessons)) {
    if (entry.status !== 'done') continue;
    totalLessonsCompleted += 1;
    const match = lessonId.match(levelPattern);
    if (match) {
      const level = match[1].toUpperCase();
      lessonsCompletedByLevel[level] = (lessonsCompletedByLevel[level] || 0) + 1;
    }
  }

  const ratio = (entry) => (entry.total > 0 ? entry.correct / entry.total : 0);

  const accuracyByType = {};
  for (const [type, entry] of Object.entries(byType)) accuracyByType[type] = ratio(entry);

  const accuracyByTag = {};
  for (const [tag, entry] of Object.entries(byTag)) accuracyByTag[tag] = ratio(entry);

  // Con menos de 5 respuestas registradas una tag es puro ruido estadístico:
  // no cuenta para el ranking de puntos débiles aunque tenga 0% de acierto.
  const MIN_ANSWERS_FOR_TAG = 5;
  const weakestTags = Object.entries(byTag)
    .filter(([, entry]) => entry.total >= MIN_ANSWERS_FOR_TAG)
    .map(([tag, entry]) => ({ tag, accuracy: ratio(entry), total: entry.total }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  return {
    lessonsCompletedByLevel,
    totalLessonsCompleted,
    accuracyByType,
    accuracyByTag,
    weakestTags,
  };
}

/* ---------- Copia de seguridad ---------- */

export function exportAll() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        out[key] = readKey(key, null);
      }
    }
  } catch {
    // Sin localStorage disponible, exportación vacía en vez de explotar.
  }
  return out;
}

export function importAll(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('importAll: se esperaba un objeto con claves "ll:v1:*".');
  }
  let imported = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof key !== 'string' || !key.startsWith(PREFIX)) continue; // ignora claves ajenas
    if (value === undefined) continue;
    writeKey(key, value);
    imported += 1;
  }
  return imported;
}

/* ---------- Reinicio ---------- */

export function resetProgress(lang) {
  try {
    localStorage.removeItem(keyProgress(lang));
    localStorage.removeItem(keySrs(lang));
    localStorage.removeItem(keyAnswers(lang));
  } catch {
    // nada que limpiar si localStorage no está disponible
  }
}
