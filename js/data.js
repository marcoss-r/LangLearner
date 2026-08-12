// js/data.js — carga y caché en memoria del JSON estático de contenido.
// Todas las rutas son relativas (PLAN.md §2: el sitio vive en un subdirectorio
// de GitHub Pages). Nunca toca localStorage: eso es cosa de store.js.

// Caché de valores ya resueltos, por clave lógica ('courses', 'course:fr',
// 'lesson:fr-a1-001', 'exam:fr-a1'...).
const cache = new Map();
// Peticiones en vuelo por la misma clave, para no disparar dos fetch a la
// vez si dos pantallas piden lo mismo simultáneamente.
const inFlight = new Map();

async function fetchJson(url, key, errorLabel) {
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      throw new Error(`${errorLabel}: no se pudo conectar con "${url}" (${err.message}).`);
    }
    if (!res.ok) {
      throw new Error(`${errorLabel}: el servidor respondió ${res.status} al pedir "${url}".`);
    }
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error(`${errorLabel}: el JSON de "${url}" no es válido (${err.message}).`);
    }
    cache.set(key, data);
    return data;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/** Índice de idiomas disponibles: ./data/courses.json */
export function loadCourses() {
  return fetchJson('./data/courses.json', 'courses', 'No se pudo cargar el índice de cursos');
}

/** Metadatos de las clases de un idioma (sin contenido): ./data/<lang>/course.json */
export function loadCourse(lang) {
  return fetchJson(`./data/${lang}/course.json`, `course:${lang}`, `No se pudo cargar el curso "${lang}"`);
}

/**
 * Contenido completo de una clase. Resuelve la ruta buscando el `id` en el
 * course.json de su idioma (el id trae el idioma como prefijo: "fr-a1-012").
 */
export async function loadLesson(lessonId) {
  const key = `lesson:${lessonId}`;
  if (cache.has(key)) return cache.get(key);

  const lang = String(lessonId).split('-')[0];
  const course = await loadCourse(lang);
  const entry = (course.lessons || []).find((l) => l.id === lessonId);
  if (!entry) {
    throw new Error(`No se pudo cargar la clase "${lessonId}": no aparece en el curso "${lang}".`);
  }
  return fetchJson(entry.file, key, `No se pudo cargar la clase "${lessonId}"`);
}

/** Prueba de nivel: ./data/<lang>/exams/<examId>.json (examId = "fr-a1", "de-b1"...). */
export function loadExam(examId) {
  const lang = String(examId).split('-')[0];
  return fetchJson(`./data/${lang}/exams/${examId}.json`, `exam:${examId}`, `No se pudo cargar el examen "${examId}"`);
}
