#!/usr/bin/env node
// tools/validate.mjs — validador de docs/SPEC-DATOS.md §10.
// Node puro, sin dependencias: `node tools/validate.mjs`.
// Recorre data/**, comprueba el esquema y sale con código 1 si hay errores.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const errors = [];

function err(file, jsonPath, message) {
  errors.push(`${file} → ${jsonPath}: ${message}`);
}

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  const raw = readFileSync(abs, 'utf8');
  return JSON.parse(raw);
}

function relFromRoot(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

/* ---------- Tipos de ejercicio conocidos y familias (SPEC-DATOS §6) ---------- */

const EXERCISE_TYPES = [
  'mcq', 'true_false', 'fill_blank', 'translate_to_target', 'translate_to_es',
  'match_pairs', 'word_order', 'conjugation', 'listening', 'shadowing',
  'speak_prompt', 'gender_article', 'categorize', 'dialogue',
  'error_correction', 'odd_one_out',
];

const FAMILIES = {
  reconocimiento: { types: ['mcq', 'true_false', 'odd_one_out', 'match_pairs'], min: 3 },
  produccion: { types: ['translate_to_target', 'fill_blank', 'word_order', 'conjugation'], min: 4 },
  comprension: { types: ['translate_to_es', 'dialogue', 'listening'], min: 2 },
  escucha: { types: ['listening'], min: 2 },
  oral: { types: ['shadowing', 'speak_prompt'], min: 2 },
};

function isArr(v) {
  return Array.isArray(v);
}

function isStr(v) {
  return typeof v === 'string' && v.length > 0;
}

/* ---------- Validación de un ejercicio individual ---------- */

function validateExercise(ex, file, jsonPath) {
  if (!isStr(ex.id)) err(file, `${jsonPath}.id`, 'falta el id del ejercicio.');
  if (!isStr(ex.type)) {
    err(file, `${jsonPath}.type`, 'falta el type del ejercicio.');
    return;
  }
  if (!EXERCISE_TYPES.includes(ex.type)) {
    err(file, `${jsonPath}.type`, `type desconocido: "${ex.type}".`);
    return;
  }
  if (!isArr(ex.tags)) err(file, `${jsonPath}.tags`, 'falta tags[].');
  if (typeof ex.difficulty !== 'number' || ex.difficulty < 1 || ex.difficulty > 3) {
    err(file, `${jsonPath}.difficulty`, 'difficulty debe ser 1, 2 o 3.');
  }
  // shadowing y speak_prompt son autoevaluados: no tienen una "respuesta
  // correcta" que explicar (SPEC-DATOS §6.10 y §6.11 no incluyen explain).
  if (!['shadowing', 'speak_prompt'].includes(ex.type) && !isStr(ex.explain)) {
    err(file, `${jsonPath}.explain`, 'falta explain.');
  }

  switch (ex.type) {
    case 'mcq':
    case 'odd_one_out': {
      if (!isArr(ex.options) || ex.options.length === 0) {
        err(file, `${jsonPath}.options`, 'falta options[].');
        break;
      }
      if (!Number.isInteger(ex.answer) || ex.answer < 0 || ex.answer >= ex.options.length) {
        err(file, `${jsonPath}.answer`, `answer (${ex.answer}) fuera de rango de options (0-${ex.options.length - 1}).`);
      }
      break;
    }
    case 'true_false': {
      if (typeof ex.answer !== 'boolean') err(file, `${jsonPath}.answer`, 'answer debe ser booleano.');
      if (!isStr(ex.statement)) err(file, `${jsonPath}.statement`, 'falta statement.');
      break;
    }
    case 'fill_blank': {
      if (!isStr(ex.text)) { err(file, `${jsonPath}.text`, 'falta text.'); break; }
      const blankCount = (ex.text.match(/___/g) || []).length;
      if (!isArr(ex.blanks)) {
        err(file, `${jsonPath}.blanks`, 'falta blanks[].');
      } else if (blankCount !== ex.blanks.length) {
        err(file, `${jsonPath}.blanks`, `hay ${blankCount} huecos "___" en text pero ${ex.blanks.length} blanks.`);
      }
      break;
    }
    case 'translate_to_target':
    case 'translate_to_es': {
      if (!isArr(ex.accept) || ex.accept.length === 0) err(file, `${jsonPath}.accept`, 'falta accept[] con al menos una forma.');
      if (!isStr(ex.prompt)) err(file, `${jsonPath}.prompt`, 'falta prompt.');
      break;
    }
    case 'match_pairs': {
      if (!isArr(ex.left) || !isArr(ex.right) || !isArr(ex.answer)) {
        err(file, `${jsonPath}`, 'match_pairs necesita left[], right[] y answer[].');
        break;
      }
      if (ex.left.length !== ex.right.length) {
        err(file, `${jsonPath}`, `left (${ex.left.length}) y right (${ex.right.length}) deben tener la misma longitud.`);
      }
      if (ex.answer.length !== ex.left.length) {
        err(file, `${jsonPath}.answer`, `answer tiene ${ex.answer.length} elementos, se esperaban ${ex.left.length}.`);
      } else {
        const seen = new Set();
        let validPermutation = true;
        for (const idx of ex.answer) {
          if (!Number.isInteger(idx) || idx < 0 || idx >= ex.right.length || seen.has(idx)) {
            validPermutation = false;
          }
          seen.add(idx);
        }
        if (!validPermutation || seen.size !== ex.right.length) {
          err(file, `${jsonPath}.answer`, 'answer no es una permutación válida de los índices de right.');
        }
      }
      break;
    }
    case 'word_order': {
      if (!isArr(ex.tokens) || !isArr(ex.answer)) {
        err(file, `${jsonPath}`, 'word_order necesita tokens[] y answer[].');
        break;
      }
      const sortedTokens = [...ex.tokens].sort();
      const sortedAnswer = [...ex.answer].sort();
      const samePermutation = ex.tokens.length === ex.answer.length &&
        sortedTokens.every((t, i) => t === sortedAnswer[i]);
      if (!samePermutation) {
        err(file, `${jsonPath}.answer`, 'answer no es una permutación exacta de tokens.');
      }
      break;
    }
    case 'conjugation': {
      if (!isStr(ex.verb)) err(file, `${jsonPath}.verb`, 'falta verb.');
      if (!isArr(ex.rows) || ex.rows.length === 0) {
        err(file, `${jsonPath}.rows`, 'falta rows[].');
      } else {
        ex.rows.forEach((row, i) => {
          if (!isStr(row.person)) err(file, `${jsonPath}.rows[${i}].person`, 'falta person.');
          if (!isArr(row.accept) || row.accept.length === 0) err(file, `${jsonPath}.rows[${i}].accept`, 'falta accept[].');
        });
      }
      break;
    }
    case 'listening': {
      if (!isStr(ex.speak)) err(file, `${jsonPath}.speak`, 'falta speak.');
      if (!['write', 'choose', 'translate'].includes(ex.mode)) {
        err(file, `${jsonPath}.mode`, `mode desconocido: "${ex.mode}".`);
      } else if (ex.mode === 'choose') {
        if (!isArr(ex.options) || ex.options.length === 0) {
          err(file, `${jsonPath}.options`, 'listening en modo choose necesita options[].');
        } else if (!Number.isInteger(ex.answer) || ex.answer < 0 || ex.answer >= ex.options.length) {
          err(file, `${jsonPath}.answer`, 'answer fuera de rango de options.');
        }
      } else if (!isArr(ex.accept) || ex.accept.length === 0) {
        err(file, `${jsonPath}.accept`, 'falta accept[].');
      }
      break;
    }
    case 'shadowing': {
      if (!isStr(ex.speak)) err(file, `${jsonPath}.speak`, 'falta speak.');
      if (!isStr(ex.es)) err(file, `${jsonPath}.es`, 'falta es.');
      break;
    }
    case 'speak_prompt': {
      if (!isStr(ex.prompt)) err(file, `${jsonPath}.prompt`, 'falta prompt.');
      if (!isStr(ex.modelAnswer)) err(file, `${jsonPath}.modelAnswer`, 'falta modelAnswer.');
      break;
    }
    case 'gender_article': {
      if (!isArr(ex.items) || ex.items.length === 0) {
        err(file, `${jsonPath}.items`, 'falta items[].');
      } else {
        ex.items.forEach((item, i) => {
          if (!isStr(item.word)) err(file, `${jsonPath}.items[${i}].word`, 'falta word.');
          if (!isArr(item.options) || item.options.length === 0) {
            err(file, `${jsonPath}.items[${i}].options`, 'falta options[].');
          } else if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.options.length) {
            err(file, `${jsonPath}.items[${i}].answer`, 'answer fuera de rango de options.');
          }
        });
      }
      break;
    }
    case 'categorize': {
      if (!isArr(ex.buckets) || ex.buckets.length === 0) {
        err(file, `${jsonPath}.buckets`, 'falta buckets[].');
      }
      if (!isArr(ex.items) || ex.items.length === 0) {
        err(file, `${jsonPath}.items`, 'falta items[].');
      } else if (isArr(ex.buckets)) {
        ex.items.forEach((item, i) => {
          if (!isStr(item.text)) err(file, `${jsonPath}.items[${i}].text`, 'falta text.');
          if (!Number.isInteger(item.bucket) || item.bucket < 0 || item.bucket >= ex.buckets.length) {
            err(file, `${jsonPath}.items[${i}].bucket`, 'bucket fuera de rango de buckets.');
          }
        });
      }
      break;
    }
    case 'dialogue': {
      if (!isArr(ex.turns) || ex.turns.length === 0) {
        err(file, `${jsonPath}.turns`, 'falta turns[].');
      } else {
        ex.turns.forEach((turn, i) => {
          if (!isStr(turn.who)) err(file, `${jsonPath}.turns[${i}].who`, 'falta who.');
          if (turn.blank) {
            if (!isArr(turn.accept) || turn.accept.length === 0) {
              err(file, `${jsonPath}.turns[${i}].accept`, 'un turno en blanco necesita accept[].');
            }
          } else if (!isStr(turn.text)) {
            err(file, `${jsonPath}.turns[${i}].text`, 'falta text.');
          }
        });
      }
      break;
    }
    case 'error_correction': {
      if (!isStr(ex.wrong)) err(file, `${jsonPath}.wrong`, 'falta wrong.');
      if (!isArr(ex.accept) || ex.accept.length === 0) err(file, `${jsonPath}.accept`, 'falta accept[].');
      break;
    }
    default:
      break;
  }
}

/* ---------- Validación de una clase completa ---------- */

function validateLesson(lesson, file, courseLessonMeta) {
  if (!isStr(lesson.id)) err(file, 'id', 'falta id.');
  if (!isStr(lesson.lang)) err(file, 'lang', 'falta lang.');
  if (!isStr(lesson.level)) err(file, 'level', 'falta level.');
  if (typeof lesson.order !== 'number') err(file, 'order', 'falta order.');
  if (!isStr(lesson.title)) err(file, 'title', 'falta title.');

  if (!isArr(lesson.objectives) || lesson.objectives.length < 3) {
    err(file, 'objectives', `hay ${lesson.objectives?.length ?? 0}, se necesitan al menos 3.`);
  }
  if (!isArr(lesson.sections) || lesson.sections.length < 3) {
    err(file, 'sections', `hay ${lesson.sections?.length ?? 0}, se necesitan al menos 3.`);
  }

  const minVocab = courseLessonMeta?.kind === 'gramatica' ? 5 : 8;
  if (!isArr(lesson.vocab) || lesson.vocab.length < minVocab) {
    err(file, 'vocab', `hay ${lesson.vocab?.length ?? 0}, se necesitan al menos ${minVocab}.`);
  }
  if (!isArr(lesson.exercises) || lesson.exercises.length < 15) {
    err(file, 'exercises', `hay ${lesson.exercises?.length ?? 0}, se necesitan al menos 15.`);
  }
  if (!isArr(lesson.srsItems) || lesson.srsItems.length < 8) {
    err(file, 'srsItems', `hay ${lesson.srsItems?.length ?? 0}, se necesitan al menos 8.`);
  }

  // Vocabulario: ids únicos, sustantivos con gender + esApprox.
  const vocabIds = new Set();
  (lesson.vocab || []).forEach((v, i) => {
    const p = `vocab[${i}]`;
    if (!isStr(v.id)) {
      err(file, `${p}.id`, 'falta id.');
    } else if (vocabIds.has(v.id)) {
      err(file, `${p}.id`, `id de vocabulario duplicado: "${v.id}".`);
    } else {
      vocabIds.add(v.id);
    }
    if (!isStr(v.esApprox)) err(file, `${p}.esApprox`, 'falta esApprox.');
    if (v.pos === 'sustantivo' && (v.gender == null || !['m', 'f', 'n'].includes(v.gender))) {
      err(file, `${p}.gender`, 'todo sustantivo necesita gender ("m", "f" o "n").');
    }
  });

  // Ejercicios: ids únicos + validación por tipo + distribución por familia.
  const exerciseIds = new Set();
  const familyCounts = { reconocimiento: 0, produccion: 0, comprension: 0, escucha: 0, oral: 0 };
  (lesson.exercises || []).forEach((ex, i) => {
    const p = `exercises[${i}]`;
    if (isStr(ex.id)) {
      if (exerciseIds.has(ex.id)) err(file, `${p}.id`, `id de ejercicio duplicado: "${ex.id}".`);
      exerciseIds.add(ex.id);
    }
    validateExercise(ex, file, p);
    for (const [family, def] of Object.entries(FAMILIES)) {
      if (def.types.includes(ex.type)) familyCounts[family] += 1;
    }
  });
  for (const [family, def] of Object.entries(FAMILIES)) {
    if (familyCounts[family] < def.min) {
      err(file, 'exercises', `familia "${family}": hay ${familyCounts[family]}, se necesitan al menos ${def.min} (tipos: ${def.types.join(', ')}).`);
    }
  }

  // srsItems: ids únicos, from existente entre vocab o ejercicios.
  const srsIds = new Set();
  (lesson.srsItems || []).forEach((s, i) => {
    const p = `srsItems[${i}]`;
    if (!isStr(s.id)) {
      err(file, `${p}.id`, 'falta id.');
    } else if (srsIds.has(s.id)) {
      err(file, `${p}.id`, `id de srsItem duplicado: "${s.id}".`);
    } else {
      srsIds.add(s.id);
    }
    if (!['word', 'phrase'].includes(s.kind)) err(file, `${p}.kind`, 'kind debe ser "word" o "phrase".');
    if (!isStr(s.from)) {
      err(file, `${p}.from`, 'falta from.');
    } else if (!vocabIds.has(s.from) && !exerciseIds.has(s.from)) {
      err(file, `${p}.from`, `from ("${s.from}") no apunta a ningún vocab.id ni exercises.id de esta clase.`);
    }
  });
}

/* ---------- Validación de un examen (data/<lang>/exams/<lang>-<level>.json) ---------- */

function validateExam(exam, file, expectedLevel, lessonLevelById) {
  if (!isStr(exam.id)) err(file, 'id', 'falta id.');
  if (!isStr(exam.lang)) err(file, 'lang', 'falta lang.');
  if (exam.level !== expectedLevel) {
    err(file, 'level', `level ("${exam.level}") no coincide con el nivel esperado "${expectedLevel}".`);
  }
  if (!isStr(exam.title)) err(file, 'title', 'falta title.');
  if (typeof exam.passScore !== 'number' || exam.passScore <= 0 || exam.passScore > 1) {
    err(file, 'passScore', 'passScore debe ser un número entre 0 y 1.');
  }
  if (typeof exam.estimatedMinutes !== 'number') err(file, 'estimatedMinutes', 'falta estimatedMinutes.');
  if (!isArr(exam.exercises) || exam.exercises.length < 70) {
    err(file, 'exercises', `hay ${exam.exercises?.length ?? 0}, se necesitan al menos 70.`);
  }

  const exerciseIds = new Set();
  (exam.exercises || []).forEach((ex, i) => {
    const p = `exercises[${i}]`;
    if (isStr(ex.id)) {
      if (exerciseIds.has(ex.id)) err(file, `${p}.id`, `id de ejercicio duplicado: "${ex.id}".`);
      exerciseIds.add(ex.id);
    }
    if (!isStr(ex.sourceLesson)) {
      err(file, `${p}.sourceLesson`, 'falta sourceLesson.');
    } else if (!lessonLevelById.has(ex.sourceLesson)) {
      err(file, `${p}.sourceLesson`, `sourceLesson "${ex.sourceLesson}" no existe en el curso.`);
    } else if (lessonLevelById.get(ex.sourceLesson) !== expectedLevel) {
      err(file, `${p}.sourceLesson`, `sourceLesson "${ex.sourceLesson}" pertenece al nivel ${lessonLevelById.get(ex.sourceLesson)}, no a ${expectedLevel}.`);
    }
    if (!isArr(ex.tags)) err(file, `${p}.tags`, 'falta tags[].');
    validateExercise(ex, file, p);
  });
}

/* ---------- Validación de un curso (data/<lang>/course.json) ---------- */

function validateCourse(lang, coursePath) {
  const file = relFromRoot(path.join(ROOT, coursePath.replace(/^\.\//, '')));
  if (!existsSync(path.join(ROOT, coursePath.replace(/^\.\//, '')))) {
    err('data/courses.json', `courses[lang=${lang}].path`, `no existe el fichero "${coursePath}".`);
    return;
  }

  let course;
  try {
    course = readJson(coursePath.replace(/^\.\//, ''));
  } catch (e) {
    err(file, '(raíz)', `JSON inválido: ${e.message}`);
    return;
  }

  if (!isArr(course.levels)) err(file, 'levels', 'falta levels[].');
  if (!isArr(course.blocks)) err(file, 'blocks', 'falta blocks[].');
  if (!isArr(course.lessons)) {
    err(file, 'lessons', 'falta lessons[].');
    return;
  }

  const orderById = new Map();
  course.lessons.forEach((l) => {
    if (isStr(l.id) && typeof l.order === 'number') orderById.set(l.id, l.order);
  });

  const referencedFiles = new Set();

  course.lessons.forEach((l, i) => {
    const p = `lessons[${i}]`;
    if (!isStr(l.id)) err(file, `${p}.id`, 'falta id.');
    if (!isStr(l.file)) {
      err(file, `${p}.file`, 'falta file.');
      return;
    }
    const lessonAbsPath = path.join(ROOT, l.file.replace(/^\.\//, ''));
    referencedFiles.add(relFromRoot(lessonAbsPath));

    if (!existsSync(lessonAbsPath)) {
      err(file, `${p}.file`, `apunta a un fichero que no existe: "${l.file}".`);
      return;
    }

    // prerequisites: deben apuntar a clases con order estrictamente menor.
    (l.prerequisites || []).forEach((preId, j) => {
      if (!orderById.has(preId)) {
        err(file, `${p}.prerequisites[${j}]`, `prerequisito "${preId}" no existe en este curso.`);
      } else if (orderById.get(preId) >= l.order) {
        err(file, `${p}.prerequisites[${j}]`, `prerequisito "${preId}" tiene order >= a esta clase (order ${l.order}).`);
      }
    });

    let lessonJson;
    try {
      lessonJson = readJson(l.file.replace(/^\.\//, ''));
    } catch (e) {
      err(relFromRoot(lessonAbsPath), '(raíz)', `JSON inválido: ${e.message}`);
      return;
    }
    validateLesson(lessonJson, relFromRoot(lessonAbsPath), l);
  });

  // "Al revés": ficheros de clase en disco que course.json no lista.
  const lessonsDir = path.join(ROOT, 'data', lang, 'lessons');
  if (existsSync(lessonsDir)) {
    for (const entry of readdirSync(lessonsDir)) {
      if (!entry.endsWith('.json')) continue;
      const rel = relFromRoot(path.join(lessonsDir, entry));
      if (!referencedFiles.has(rel)) {
        err(file, 'lessons', `el fichero "${rel}" existe en disco pero ninguna entrada de lessons[] lo referencia.`);
      }
    }
  }

  // Exámenes de nivel (Fase 6): data/<lang>/exams/<lang>-<level>.json
  const lessonLevelById = new Map();
  course.lessons.forEach((l) => {
    if (isStr(l.id) && isStr(l.level)) lessonLevelById.set(l.id, l.level);
  });

  (course.levels || []).forEach((lvl, i) => {
    const p = `levels[${i}]`;
    if (!isStr(lvl.exam)) {
      err(file, `${p}.exam`, 'falta exam.');
      return;
    }
    const examRelPath = `data/${lang}/exams/${lvl.exam}.json`;
    const examAbsPath = path.join(ROOT, examRelPath);
    if (!existsSync(examAbsPath)) {
      err(file, `${p}.exam`, `no existe el fichero de examen "${examRelPath}".`);
      return;
    }
    let examJson;
    try {
      examJson = readJson(examRelPath);
    } catch (e) {
      err(examRelPath, '(raíz)', `JSON inválido: ${e.message}`);
      return;
    }
    validateExam(examJson, examRelPath, lvl.id, lessonLevelById);
  });
}

/* ---------- Arranque ---------- */

function main() {
  const coursesPath = path.join(ROOT, 'data', 'courses.json');
  if (!existsSync(coursesPath)) {
    console.error('No se encuentra data/courses.json.');
    process.exit(1);
  }

  let courses;
  try {
    courses = readJson('data/courses.json');
  } catch (e) {
    console.error(`data/courses.json → JSON inválido: ${e.message}`);
    process.exit(1);
  }

  if (!isArr(courses.courses)) {
    err('data/courses.json', 'courses', 'falta courses[].');
  } else {
    for (const c of courses.courses) {
      if (!isStr(c.lang) || !isStr(c.path)) {
        err('data/courses.json', 'courses[]', 'cada entrada necesita lang y path.');
        continue;
      }
      validateCourse(c.lang, c.path);
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(es) de validación:\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error('');
    process.exit(1);
  }

  console.log('Validación OK: todo el contenido en data/** cumple el esquema de SPEC-DATOS.md.');
}

main();
