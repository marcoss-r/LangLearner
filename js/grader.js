// js/grader.js — normalización y corrección tolerante de respuestas
// (docs/SPEC-DATOS.md §8). Módulo puro: sin DOM, sin localStorage,
// importable desde Node tal cual para tools/test-core.mjs.

/**
 * Pipeline de normalización, en el orden exacto de SPEC-DATOS §8:
 *  1. trim() y colapsar espacios múltiples.
 *  2. Normalizar comillas y apóstrofos tipográficos.
 *  3. Quitar puntuación final (. ! ? ;) y el espacio francés antes de ? !
 *  4. minúsculas.
 *  5. Alemán: equivalencias ß↔ss, ä↔ae, ö↔oe, ü↔ue.
 *  6. Si stripAccents: quitar diacríticos.
 */
export function normalize(text, { lang, stripAccents = false } = {}) {
  let t = String(text ?? '');

  t = t.trim().replace(/\s+/g, ' ');
  t = t.replace(/[‘’‛`]/g, "'");
  t = t.replace(/[«»“”„]/g, '"');
  // El espacio antes de ? y ! es ortografía francesa correcta: no debe
  // penalizar. Se quita junto con la puntuación final de cierre.
  t = t.replace(/\s+([?!])/g, '$1');
  t = t.replace(/[.!?;]+$/g, '');
  t = t.toLowerCase();

  if (lang === 'de') {
    t = t.replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  }

  if (stripAccents) {
    t = t.normalize('NFD').replace(/\p{Diacritic}/gu, '').normalize('NFC');
  }

  return t;
}

/** Distancia de Levenshtein clásica, sin dependencias. */
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // eliminar
        curr[j - 1] + 1, // insertar
        prev[j - 1] + cost // sustituir
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Corrige `userAnswer` contra la lista de formas aceptadas.
 * Devuelve { result: 'ok'|'close'|'fail', matched, expected, reason }
 * con reason ∈ 'exact'|'typo'|'accents'|'none'.
 */
export function check(userAnswer, acceptList, { lang, strictAccents = false } = {}) {
  const list = (Array.isArray(acceptList) ? acceptList : [acceptList]).filter((x) => x != null);
  const raw = String(userAnswer ?? '');

  if (raw.trim() === '') {
    return { result: 'fail', matched: null, expected: list[0] ?? '', reason: 'none' };
  }

  const strictOpt = { lang, stripAccents: false };
  const looseOpt = { lang, stripAccents: true };

  const userStrict = normalize(raw, strictOpt);
  const userLoose = normalize(raw, looseOpt);
  const userCmp = strictAccents ? userStrict : userLoose;

  // Mejor candidato "casi" encontrado hasta ahora entre todas las entradas
  // de accept. 'accents' siempre gana a 'typo' (distancia -1 centinela).
  let bestClose = null;

  for (const expected of list) {
    const expLoose = normalize(expected, looseOpt);
    const expCmp = strictAccents ? normalize(expected, strictOpt) : expLoose;

    if (userCmp === expCmp) {
      // Acierto. Si se aceptó solo porque no exigimos tildes, se marca como
      // 'accents' para que la interfaz pueda enseñar la grafía correcta: es un
      // acierto, pero el usuario tiene que ver dónde iba el acento.
      const sloppyAccents = !strictAccents && userStrict !== normalize(expected, strictOpt);
      return { result: 'ok', matched: expected, expected, reason: sloppyAccents ? 'accents' : 'exact' };
    }

    if (strictAccents && userLoose === expLoose) {
      bestClose = { expected, reason: 'accents', distance: -1 };
      continue;
    }

    const distance = levenshtein(userCmp, expCmp);
    const threshold = userCmp.length > 12 ? 2 : 1;
    if (distance <= threshold && (!bestClose || distance < bestClose.distance)) {
      bestClose = { expected, reason: 'typo', distance };
    }
  }

  if (bestClose) {
    return { result: 'close', matched: bestClose.expected, expected: bestClose.expected, reason: bestClose.reason };
  }

  return { result: 'fail', matched: null, expected: list[0] ?? '', reason: 'none' };
}

/**
 * Devuelve `expected` con el tramo que diverge de `user` resaltado en
 * **negrita markdown**, para el mensaje de "casi". Compara por prefijo y
 * sufijo comunes (case-insensitive) y marca lo que queda en medio.
 */
export function diffHint(user, expected) {
  const u = String(user ?? '');
  const e = String(expected ?? '');
  const minLen = Math.min(u.length, e.length);

  let start = 0;
  while (start < minLen && u[start].toLowerCase() === e[start].toLowerCase()) start++;

  let endU = u.length - 1;
  let endE = e.length - 1;
  while (endU >= start && endE >= start && u[endU].toLowerCase() === e[endE].toLowerCase()) {
    endU--;
    endE--;
  }

  if (endE < start) return e; // no hay diferencia detectable (p.ej. solo mayúsculas)

  const prefix = e.slice(0, start);
  const middle = e.slice(start, endE + 1);
  const suffix = e.slice(endE + 1);
  return `${prefix}**${middle}**${suffix}`;
}
