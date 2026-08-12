// js/srs.js — repaso espaciado, SM-2 simplificado (PLAN.md §8).
//
// Módulo puro: no toca localStorage ni el DOM. Recibe estado y devuelve
// estado nuevo. `store.js` es el único que persiste lo que aquí se calcula.
// Importable desde Node para las pruebas de tools/test-core.mjs.

const MAX_SESSION_CARDS = 40;

/**
 * Clave de fecha en hora LOCAL, formato YYYY-MM-DD. Nunca se usa un
 * timestamp con horas para comparar vencimientos: si se usara UTC, a un
 * usuario en España las tarjetas podrían darse por vencidas (o no) hasta
 * dos horas antes/después de la medianoche real, dependiendo del cambio
 * de hora.
 */
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(key, days) {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

/** Estado inicial de una tarjeta nueva, aún no repasada. */
export function newCard() {
  return { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: todayKey(), lastAt: null };
}

/**
 * Aplica una calificación (q = 0/3/4/5, ver PLAN.md §8) a una tarjeta y
 * devuelve la tarjeta resultante. No muta `card`.
 *
 * Nota de diseño: el EF se recalcula siempre (acierto o fallo), como en el
 * SM-2 original. En un fallo (q<3) `reps` vuelve a 0 -- la tarjeta empieza
 * de cero su progresión de intervalos 1 → 3 → interval*ef aunque conserve
 * el EF ya aprendido y sume un lapse. Esto no está escrito letra por letra
 * en PLAN.md, pero es la única lectura consistente con "interval = 1" +
 * "reps===1 ? 1 : reps===2 ? 3 : …" para las siguientes veces que se acierte.
 */
export function grade(card, q) {
  let ef = card.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;

  let reps;
  let interval;
  let lapses = card.lapses;

  if (q < 3) {
    reps = 0;
    interval = 1;
    lapses = card.lapses + 1;
  } else {
    reps = card.reps + 1;
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(card.interval * ef);
  }

  const today = todayKey();
  return {
    ef,
    interval,
    reps,
    lapses,
    due: addDays(today, interval),
    lastAt: new Date().toISOString(),
  };
}

/** ¿Está vencida la tarjeta a fecha `today` (YYYY-MM-DD)? */
export function isDue(card, today = todayKey()) {
  return card.due <= today;
}

/**
 * Tarjetas vencidas, ordenadas por vencimiento más antiguo primero
 * (empate → sin orden garantizado adicional), con tope de sesión.
 */
export function dueCards(cards, today = todayKey()) {
  return Object.entries(cards)
    .filter(([, card]) => isDue(card, today))
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : 0))
    .slice(0, MAX_SESSION_CARDS)
    .map(([key, card]) => ({ key, card }));
}

/**
 * Añade al mazo las tarjetas nuevas de una clase recién completada, sin
 * tocar las que ya existieran (para no perder el historial de repasos al
 * rehacer una clase). Devuelve un objeto nuevo, no muta `existingCards`.
 */
export function addLessonCards(existingCards, lessonId, srsItems) {
  const result = { ...existingCards };
  for (const item of srsItems) {
    const key = `${lessonId}::${item.id}`;
    if (!(key in result)) {
      result[key] = newCard();
    }
  }
  return result;
}

/**
 * Formato de repaso para la próxima vez que salga esta tarjeta. Alterna
 * según `reps` (número de aciertos consecutivos acumulados): reconocimiento
 * (ver FR → decir ES) es el más fácil, producción y escucha valen más y se
 * intercalan con más frecuencia relativa.
 */
export function pickFormat(card) {
  const cycle = ['recognition', 'production', 'listening'];
  return cycle[card.reps % cycle.length];
}
