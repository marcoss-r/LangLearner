// tools/test-core.mjs — pruebas de los módulos puros de la Fase 1.
// Node sin dependencias: `node --test tools/test-core.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalize, check, diffHint, levenshtein } from '../js/grader.js';
import { newCard, grade, isDue, dueCards, addLessonCards, pickFormat, todayKey } from '../js/srs.js';

/* ============================================================
 * grader.js — casos de docs/SPEC-DATOS.md §8 + extras
 * ============================================================ */

test('grader: "Ouvre la fenêtre !" acepta "ouvre la fenetre" (mayúsculas, tildes, puntuación)', () => {
  const r = check('ouvre la fenetre', ['Ouvre la fenêtre !'], { lang: 'fr', strictAccents: false });
  assert.equal(r.result, 'ok');
  // Acierto, pero marcado como 'accents' para que la interfaz pueda enseñar
  // dónde iban las tildes que el usuario se ha saltado.
  assert.equal(r.reason, 'accents');
});

test('grader: "l’école" (apóstrofo tipográfico) acepta "l\'ecole"', () => {
  const r = check("l'ecole", ['l’école'], { lang: 'fr', strictAccents: false });
  assert.equal(r.result, 'ok');
  assert.equal(r.reason, 'accents');
});

test('grader: sin diferencia de tildes, un acierto es "exact" y no "accents"', () => {
  const r = check("l'école", ['l’école'], { lang: 'fr', strictAccents: false });
  assert.equal(r.result, 'ok');
  assert.equal(r.reason, 'exact');
});

test('grader: alemán, "Ich heiße Marco" acepta "ich heisse marco" (ß↔ss)', () => {
  const r = check('ich heisse marco', ['Ich heiße Marco'], { lang: 'de' });
  assert.equal(r.result, 'ok');
  assert.equal(r.reason, 'exact');
});

test('grader: respuesta vacía siempre falla, con reason "none"', () => {
  const r = check('', ['Bonjour'], { lang: 'fr' });
  assert.equal(r.result, 'fail');
  assert.equal(r.reason, 'none');
  assert.equal(r.matched, null);

  const r2 = check('   ', ['Bonjour'], { lang: 'fr' });
  assert.equal(r2.result, 'fail');
});

test('grader: espacios de sobra no penalizan ("Je  vais   au cinéma.")', () => {
  const r = check('Je  vais   au cinéma.', ['Je vais au cinéma'], { lang: 'fr', strictAccents: true });
  assert.equal(r.result, 'ok');
  assert.equal(r.reason, 'exact');
});

test('grader: strictAccents=true detecta diferencia solo de tildes como "close"/accents', () => {
  const r = check('cinema', ['cinéma'], { lang: 'fr', strictAccents: true });
  assert.equal(r.result, 'close');
  assert.equal(r.reason, 'accents');
});

test('grader: strictAccents=false perdona la misma diferencia de tildes, pero la señala', () => {
  const r = check('cinema', ['cinéma'], { lang: 'fr', strictAccents: false });
  assert.equal(r.result, 'ok');
  assert.equal(r.reason, 'accents');
  assert.equal(r.expected, 'cinéma');
});

test('grader: alemán ü↔ue combinado con ß↔ss ("grüßen" / "gruessen")', () => {
  const r = check('gruessen', ['grüßen'], { lang: 'de' });
  assert.equal(r.result, 'ok');
});

test('grader: una errata de una letra cuenta como "close"/typo (Levenshtein ≤1)', () => {
  const r = check('Bonjur', ['Bonjour'], { lang: 'fr' });
  assert.equal(r.result, 'close');
  assert.equal(r.reason, 'typo');
});

test('grader: umbral se amplía a 2 en respuestas de más de 12 caracteres', () => {
  // "je voudrait une pome" vs "je voudrais une pomme": 2 ediciones, 21 caracteres.
  const r = check('je voudrait une pome', ['je voudrais une pomme'], { lang: 'fr', strictAccents: false });
  assert.equal(r.result, 'close');
  assert.equal(r.reason, 'typo');
});

test('grader: respuesta muy distinta es un fallo', () => {
  const r = check('banana', ['Bonjour'], { lang: 'fr' });
  assert.equal(r.result, 'fail');
  assert.equal(r.reason, 'none');
});

test('grader: normalize colapsa espacios, comillas tipográficas y puntuación final', () => {
  // El espacio antes de "?" desaparece y la puntuación final de cierre se
  // quita entera: es lo que permite que "Ouvre la fenêtre !" case con
  // "ouvre la fenetre" sin la exclamación.
  assert.equal(normalize('  Ça   va ?  '), 'ça va');
  assert.equal(normalize('«Bonjour»'), '"bonjour"');
  assert.equal(normalize('Salut !'), 'salut');
});

test('grader: levenshtein propio calcula distancias básicas', () => {
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('chat', 'chat'), 0);
  assert.equal(levenshtein('chat', 'chats'), 1);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

test('grader: diffHint resalta el tramo que diverge', () => {
  const hint = diffHint('la fenetre', 'la fenêtre');
  assert.match(hint, /\*\*.*\*\*/);
  assert.ok(hint.startsWith('la fen'));
});

/* ============================================================
 * srs.js — SM-2 simplificado (PLAN.md §8)
 * ============================================================ */

test('srs: newCard() da el estado inicial correcto', () => {
  const c = newCard();
  assert.equal(c.ef, 2.5);
  assert.equal(c.interval, 0);
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 0);
  assert.equal(c.due, todayKey());
});

test('srs: progresión de intervalos con aciertos "Bien" (q=4): 1 → 3 → interval*ef', () => {
  let card = newCard();
  card = grade(card, 4);
  assert.equal(card.interval, 1);
  assert.equal(card.reps, 1);

  card = grade(card, 4);
  assert.equal(card.interval, 3);
  assert.equal(card.reps, 2);

  card = grade(card, 4);
  // ef no cambia con q=4 (delta = 0.1 - 1*(0.08+1*0.02) = 0), así que sigue en 2.5.
  assert.equal(card.ef, 2.5);
  assert.equal(card.interval, Math.round(3 * 2.5)); // 8
  assert.equal(card.reps, 3);
});

test('srs: el EF tiene un suelo de 1.3, nunca baja de ahí', () => {
  let card = newCard();
  for (let i = 0; i < 10; i++) {
    card = grade(card, 0); // "Otra vez" en cada repaso
  }
  assert.equal(card.ef, 1.3);
});

test('srs: q<3 reinicia el intervalo a 1, resetea reps y suma un lapse', () => {
  let card = newCard();
  card = grade(card, 4);
  card = grade(card, 4);
  card = grade(card, 4); // interval=8, reps=3, lapses=0
  assert.equal(card.lapses, 0);

  const failed = grade(card, 0); // "Otra vez"
  assert.equal(failed.interval, 1);
  assert.equal(failed.reps, 0);
  assert.equal(failed.lapses, 1);
});

test('srs: due se calcula sumando el intervalo en días a partir de hoy', () => {
  let card = newCard();
  card = grade(card, 4); // interval 1
  const expected = new Date();
  expected.setDate(expected.getDate() + 1);
  assert.equal(card.due, todayKey(expected));
});

test('srs: isDue() compara claves YYYY-MM-DD', () => {
  const today = todayKey();
  assert.equal(isDue({ due: today }, today), true);
  assert.equal(isDue({ due: '2000-01-01' }, today), true);
  assert.equal(isDue({ due: '2999-01-01' }, today), false);
});

test('srs: dueCards respeta el tope de 40 y ordena por vencimiento más antiguo primero', () => {
  const cards = {};
  for (let i = 0; i < 50; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i); // todas vencidas, cuanto mayor i, más antigua
    cards[`c${i}`] = { ...newCard(), due: todayKey(d) };
  }
  const due = dueCards(cards, todayKey());
  assert.equal(due.length, 40);
  // La primera debe ser la más antigua (i=49), es decir due más pequeño.
  for (let i = 1; i < due.length; i++) {
    assert.ok(due[i - 1].card.due <= due[i].card.due);
  }
});

test('srs: addLessonCards añade tarjetas nuevas sin tocar las existentes', () => {
  const existing = { 'fr-a1-001::v1': { ...newCard(), reps: 5, interval: 30 } };
  const merged = addLessonCards(existing, 'fr-a1-001', [{ id: 'v1' }, { id: 'v2' }]);
  assert.equal(merged['fr-a1-001::v1'].reps, 5); // no se ha tocado
  assert.equal(merged['fr-a1-001::v1'].interval, 30);
  assert.ok(merged['fr-a1-001::v2']);
  assert.equal(merged['fr-a1-001::v2'].reps, 0); // tarjeta nueva
});

test('srs: pickFormat alterna entre reconocimiento, producción y escucha', () => {
  assert.equal(pickFormat({ reps: 0 }), 'recognition');
  assert.equal(pickFormat({ reps: 1 }), 'production');
  assert.equal(pickFormat({ reps: 2 }), 'listening');
  assert.equal(pickFormat({ reps: 3 }), 'recognition');
});

/* ============================================================
 * store.js — localStorage con shim en memoria
 * ============================================================ */

class MemoryStorage {
  constructor() {
    this._map = new Map();
  }
  getItem(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  }
  setItem(key, value) {
    this._map.set(key, String(value));
  }
  removeItem(key) {
    this._map.delete(key);
  }
  clear() {
    this._map.clear();
  }
  key(i) {
    return Array.from(this._map.keys())[i] ?? null;
  }
  get length() {
    return this._map.size;
  }
}

// store.js referencia el global `localStorage` (igual que en un navegador).
// Este shim solo necesita existir antes de que se LLAMEN las funciones de
// store.js, no antes de importarlo: store.js no toca localStorage al cargar
// el módulo, solo dentro de sus funciones.
globalThis.localStorage = new MemoryStorage();

const store = await import('../js/store.js');

test('store: markLessonDone nunca empeora un bestScore anterior', () => {
  globalThis.localStorage.clear();
  store.markLessonDone('fr', 'fr-a1-001', { score: 0.9, durationMs: 60000 });
  let entry = store.getProgress('fr').lessons['fr-a1-001'];
  assert.equal(entry.bestScore, 0.9);
  assert.equal(entry.attempts, 1);

  store.markLessonDone('fr', 'fr-a1-001', { score: 0.5, durationMs: 30000 });
  entry = store.getProgress('fr').lessons['fr-a1-001'];
  assert.equal(entry.bestScore, 0.9); // no empeora
  assert.equal(entry.attempts, 2); // pero sí cuenta el intento

  store.markLessonDone('fr', 'fr-a1-001', { score: 0.95, durationMs: 20000 });
  entry = store.getProgress('fr').lessons['fr-a1-001'];
  assert.equal(entry.bestScore, 0.95); // sí mejora si el nuevo intento es mejor
});

test('store: addActivity agrega sobre la clave del día en curso', () => {
  globalThis.localStorage.clear();
  store.addActivity({ minutes: 10, exercises: 5, correct: 4, lang: 'fr' });
  store.addActivity({ minutes: 5, exercises: 2, correct: 2, lang: 'fr' });

  const today = todayKey();
  const day = store.getActivity()[today];
  assert.equal(day.minutes, 15);
  assert.equal(day.exercises, 7);
  assert.equal(day.correct, 6);
  assert.equal(day.lang.fr, 15);
});

test('store: exportAll / importAll hacen ida y vuelta sin pérdida', () => {
  globalThis.localStorage.clear();
  store.updateSettings({ activeLang: 'de', ttsRate: 1.1 });
  store.markLessonDone('fr', 'fr-a1-001', { score: 0.8, durationMs: 1000 });
  store.addActivity({ minutes: 12, exercises: 3, correct: 3, lang: 'fr' });
  store.recordAnswer('fr', { type: 'mcq', tags: ['articulos'], correct: true });

  const dump = store.exportAll();

  // Simula un almacenamiento nuevo (otro dispositivo / Safari borrado).
  globalThis.localStorage = new MemoryStorage();
  const imported = store.importAll(dump);
  assert.ok(imported > 0);

  assert.equal(store.getSettings().activeLang, 'de');
  assert.equal(store.getSettings().ttsRate, 1.1);
  assert.equal(store.getProgress('fr').lessons['fr-a1-001'].bestScore, 0.8);
  assert.equal(store.getActivity()[todayKey()].minutes, 12);
  assert.equal(store.getStats('fr').accuracyByType.mcq, 1);
});

test('store: getSettings devuelve los valores por defecto de PLAN.md §6 si no hay nada guardado', () => {
  globalThis.localStorage = new MemoryStorage();
  const s = store.getSettings();
  assert.equal(s.activeLang, 'fr');
  assert.equal(s.ttsRate, 0.9);
  assert.equal(s.showIpa, true);
  assert.equal(s.dailyGoalMin, 15);
});

test('store: lecturas con JSON corrupto devuelven el valor por defecto sin lanzar', () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.localStorage.setItem('ll:v1:settings', '{ esto no es json');
  assert.doesNotThrow(() => store.getSettings());
  assert.equal(store.getSettings().activeLang, 'fr');
});

test('store: recordAnswer acumula precisión por tipo y por tag; getStats calcula el ranking de puntos débiles', () => {
  globalThis.localStorage = new MemoryStorage();
  // 5 respuestas en la tag "articulos": 2 aciertos, 3 fallos → 0.4 de precisión.
  for (let i = 0; i < 2; i++) store.recordAnswer('fr', { type: 'mcq', tags: ['articulos'], correct: true });
  for (let i = 0; i < 3; i++) store.recordAnswer('fr', { type: 'mcq', tags: ['articulos'], correct: false });
  // Solo 2 respuestas en "genero": no debe entrar en el ranking (ruido, <5).
  store.recordAnswer('fr', { type: 'gender_article', tags: ['genero'], correct: false });
  store.recordAnswer('fr', { type: 'gender_article', tags: ['genero'], correct: false });

  const stats = store.getStats('fr');
  assert.equal(stats.accuracyByTag.articulos, 0.4);
  const tags = stats.weakestTags.map((t) => t.tag);
  assert.ok(tags.includes('articulos'));
  assert.ok(!tags.includes('genero')); // menos de 5 respuestas: no cuenta
});
