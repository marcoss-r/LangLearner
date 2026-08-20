#!/usr/bin/env node
// tools/check-progression.mjs — auditoría pedagógica de la progresión.
// Node puro, sin dependencias: `node tools/check-progression.mjs`.
//
// `validate.mjs` comprueba que el JSON cumple el esquema. Esto comprueba algo
// distinto y que ningún esquema puede ver: que **una clase no exija producir
// nada que el alumno no haya visto todavía**. Es el error que convierte un
// curso en una trampa: pedir la conjugación de être en la clase 1, o traducir
// del español al francés cuando solo se han visto falsos amigos.
//
// Dos reglas, las dos declaradas en `data/<lang>/course.json → progression`:
//
//  1. Puerta de tipo (etapas). Una clase de la etapa de reconocimiento no
//     puede pedir producción escrita libre; ninguna clase puede pedir una
//     conjugación antes de que el curso enseñe paradigmas verbales.
//  2. Puerta léxica. Toda palabra en idioma meta que el alumno deba escribir,
//     ordenar o decir tiene que haber aparecido antes: en la teoría de esa
//     misma clase (`sections`, `vocab`) o en cualquier parte de una clase
//     anterior. Los ejercicios de la propia clase NO cuentan como exposición
//     para lo que esa clase exige: si la primera vez que aparece «aujourd'hui»
//     es en el enunciado que hay que traducir, no se ha enseñado.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const problems = [];

// «error» rompe el build; «aviso» solo informa. La línea está en
// `freeProductionFrom`: antes de esa clase el alumno no tiene con qué defenderse
// y cualquier hueco es una trampa, así que es error. A partir de ahí, encontrar
// una palabra nueva dentro de un ejercicio (con su `explain` y sus `hintWords`)
// es cómo se aprende un idioma, no un fallo de diseño.
function fail(lessonId, exId, message, level = 'error') {
  problems.push({ lessonId, exId, message, level });
}

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8'));
}

/* ---------- Tokenización ---------- */

// j'ai, l'école, qu'est-ce → se parten para que «ai» o «école» cuenten sueltas.
const ELISION = /\b(j|l|n|d|s|c|t|m|qu|jusqu|lorsqu|puisqu)['’]/gi;

function words(str) {
  if (typeof str !== 'string') return [];
  const raw = str
    .replace(ELISION, '$1 ')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^[\d-]+$/.test(w));
  // «Attends-moi» cuenta a la vez como bloque y como sus piezas: si la clase
  // enseñó la frase entera, «attends» suelto tampoco es nuevo.
  const out = [];
  for (const w of raw) {
    out.push(w);
    if (w.includes('-')) out.push(...w.split('-').filter((p) => p && !/^\d+$/.test(p)));
  }
  return out;
}

// Los nombres propios no se «enseñan»: Madrid o Ana no son vocabulario nuevo.
// Se detectan por la mayúscula en mitad de frase, que es donde el francés y el
// alemán se separan: en alemán TODO sustantivo va en mayúscula, así que allí
// solo se descartan los que no llevan artículo delante.
function properNouns(str) {
  if (typeof str !== 'string') return new Set();
  const out = new Set();
  const sentences = str.split(/(?<=[.!?¿¡:])\s+|\n/);
  for (const sentence of sentences) {
    const toks = sentence.trim().split(/\s+/);
    toks.forEach((tok, i) => {
      const clean = tok.replace(/^[^\p{L}]+|[^\p{L}\p{M}-]+$/gu, '');
      if (i === 0 || !clean) return;
      if (/^\p{Lu}/u.test(clean)) words(clean).forEach((w) => out.add(w));
    });
  }
  return out;
}

function collectStrings(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => collectStrings(n, out));
  else if (typeof node === 'object') Object.values(node).forEach((n) => collectStrings(n, out));
  return out;
}

/** Lo que la TEORÍA de la clase pone delante del alumno antes de los ejercicios. */
function theoryStrings(lesson) {
  const out = collectStrings(lesson.sections ?? []);
  for (const v of lesson.vocab ?? []) {
    out.push(v.target ?? '', v.plural ?? '', v.speak ?? '', v.example?.target ?? '');
  }
  return out.filter(Boolean);
}

/* ---------- Qué exige producir cada tipo de ejercicio ---------- */

// Producción escrita libre: el alumno teclea idioma meta sin apoyo.
const FREE_WRITING = new Set(['translate_to_target', 'error_correction']);

function isDictation(ex) {
  return ex.type === 'listening' && ex.mode === 'write';
}

function hasFreeDialogueBlank(ex) {
  return ex.type === 'dialogue' && (ex.turns ?? []).some((t) => t.blank);
}

/** Cadenas en idioma meta que el ejercicio obliga a producir. */
function produced(ex) {
  const first = (arr) => (Array.isArray(arr) && arr.length ? [arr[0]] : []);
  switch (ex.type) {
    case 'translate_to_target':
      return first(ex.accept);
    case 'error_correction':
      // `wrong` se lee, no se escribe: lo que el alumno teclea es la corrección.
      return first(ex.accept);
    case 'word_order':
      return [(ex.answer ?? []).join(' ')];
    case 'conjugation':
      return [ex.verb ?? '', ...(ex.rows ?? []).flatMap((r) => first(r.accept))];
    case 'fill_blank':
      // El `bank` son botones que se eligen: un distractor desconocido no es
      // una trampa, es justo lo que hay que descartar.
      return [
        (ex.text ?? '').replace(/_{2,}/g, ' '),
        ...(ex.blanks ?? []).flatMap((b) => first(b.accept)),
      ];
    case 'dialogue':
      return (ex.turns ?? []).filter((t) => t.blank).flatMap((t) => first(t.accept));
    case 'listening':
      return isDictation(ex) ? first(ex.accept) : [];
    case 'speak_prompt':
      return [ex.modelAnswer ?? ''];
    default:
      return [];
  }
}

/* ---------- Etapas ---------- */

function stageOf(order, progression) {
  if (order <= progression.recognitionUntil) return 'reconocimiento';
  if (order < progression.freeProductionFrom) return 'guiada';
  return 'libre';
}

// Tipos vetados en cada etapa y por qué. La etapa «libre» no veta nada.
const STAGE_BANS = {
  reconocimiento: {
    translate_to_target: 'traducir ES→meta exige producir gramática que aún no se ha explicado',
    word_order: 'ordenar una frase exige saber su sintaxis',
    error_correction: 'corregir un error exige conocer la regla que se incumple',
    conjugation: 'no se ha presentado ningún paradigma verbal todavía',
    dictation: 'el dictado exige saber escribir palabras que aún no se han visto',
    dialogue: 'completar un diálogo a mano exige producción libre',
  },
  guiada: {
    conjugation: 'no se ha presentado ningún paradigma verbal todavía',
  },
};

/* ---------- Recorrido de un idioma ---------- */

function checkLang(lang) {
  const course = readJson(`data/${lang}/course.json`);
  const progression = course.progression;
  if (!progression) {
    fail(`${lang}/course.json`, null, 'falta el bloque "progression" (recognitionUntil, freeProductionFrom).');
    return;
  }

  const seen = new Set();  // todo el idioma meta ya expuesto en clases anteriores

  for (const meta of course.lessons) {
    const lesson = readJson(meta.file.replace(/^\.\//, ''));
    const stage = stageOf(lesson.order, progression);
    const bans = STAGE_BANS[stage] ?? {};

    // La teoría de esta clase ya cuenta: se lee antes de los ejercicios.
    const known = new Set(seen);
    theoryStrings(lesson).forEach((s) => words(s).forEach((w) => known.add(w)));

    for (const ex of lesson.exercises ?? []) {
      const banKey = isDictation(ex) ? 'dictation'
        : ex.type === 'dialogue' && !hasFreeDialogueBlank(ex) ? null
        : ex.type;
      if (banKey && bans[banKey]) {
        fail(lesson.id, ex.id, `etapa «${stage}»: ${banKey} no está permitido — ${bans[banKey]}.`);
      }

      const strs = produced(ex).filter(Boolean);
      if (!strs.length) continue;
      const skip = new Set();
      strs.forEach((s) => properNouns(s).forEach((w) => skip.add(w)));
      const unknown = [...new Set(strs.flatMap(words))]
        // Los deletreos («Ça s'écrit M, A, R, C, O», «M-A-R-C-O») no son léxico.
        .filter((w) => w.length > 1 && !/^(\p{L}-)+\p{L}$/u.test(w))
        .filter((w) => !known.has(w) && !skip.has(w));
      if (unknown.length) {
        fail(
          lesson.id, ex.id,
          `${ex.type} exige producir palabras nunca vistas: ${unknown.join(', ')}.`,
          stage === 'libre' ? 'aviso' : 'error'
        );
      }
    }

    // Cerrada la clase, todo su contenido pasa a ser conocido.
    collectStrings(lesson).forEach((s) => words(s).forEach((w) => seen.add(w)));
  }
}

/* ---------- main ---------- */

function main() {
  const langs = readJson('data/courses.json').courses.map((c) => c.lang);
  langs.forEach(checkLang);

  const errors = problems.filter((p) => p.level === 'error');
  const warnings = problems.filter((p) => p.level === 'aviso');

  const byLesson = new Map();
  for (const p of errors) {
    if (!byLesson.has(p.lessonId)) byLesson.set(p.lessonId, []);
    byLesson.get(p.lessonId).push(p);
  }
  for (const [lessonId, list] of byLesson) {
    console.error(`\n${lessonId}`);
    for (const p of list) console.error(`  ${p.exId ?? '-'}: ${p.message}`);
  }

  if (warnings.length) {
    const lessons = new Set(warnings.map((w) => w.lessonId)).size;
    console.log(
      `\n${warnings.length} avisos en ${lessons} clases de etapa libre: una palabra nueva aparece`
      + ' por primera vez dentro del ejercicio que la pide. Revisable, no bloqueante'
      + ' (usa --avisos para verlos).'
    );
    if (process.argv.includes('--avisos')) {
      for (const w of warnings) console.log(`  ${w.lessonId} ${w.exId}: ${w.message}`);
    }
  }

  if (!errors.length) {
    console.log('Progresión correcta: ninguna clase exige producir nada sin haberlo enseñado antes.');
    return;
  }
  console.error(`\n${errors.length} errores de progresión en ${byLesson.size} clases.`);
  process.exit(1);
}

main();
