// js/audio.js — única capa que toca `speechSynthesis` (PLAN.md §2 y §3).
// Ningún otro módulo debe llamar a la Web Speech API directamente.
//
// Importante: nada de esto se ejecuta al importar el módulo. Todo el acceso
// a `window`/`speechSynthesis` vive dentro de funciones, para poder importar
// este fichero desde Node (tools/test-core.mjs) sin que explote.

const LANG_TAG = { fr: 'fr-FR', de: 'de-DE' };
const VOICES_TIMEOUT_MS = 3000;

function hasSpeechSynthesis() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** ¿Soporta este entorno la síntesis de voz? */
export function isSupported() {
  return hasSpeechSynthesis();
}

/**
 * Promesa que resuelve con el array de voces disponibles.
 * Trampa de Safari: `getVoices()` devuelve `[]` en la primera llamada, y a
 * veces el evento `voiceschanged` no llega nunca. Por eso hay timeout de
 * seguridad de 3 s: mejor una lista vacía que una promesa colgada para siempre.
 */
export function voicesReady() {
  if (!hasSpeechSynthesis()) return Promise.resolve([]);

  const synth = window.speechSynthesis;
  const initial = synth.getVoices();
  if (initial && initial.length > 0) return Promise.resolve(initial);

  return new Promise((resolve) => {
    let done = false;
    const finish = (voices) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', onChange);
      resolve(voices);
    };
    const onChange = () => {
      const voices = synth.getVoices();
      if (voices && voices.length > 0) finish(voices);
    };
    synth.addEventListener('voiceschanged', onChange);
    const timer = setTimeout(() => finish(synth.getVoices() || []), VOICES_TIMEOUT_MS);
  });
}

/** Voces cuyo `lang` empieza por el idioma pedido ('fr' | 'de'). */
export async function listVoices(lang) {
  const voices = await voicesReady();
  return voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
}

/** ¿Hay al menos una voz instalada para este idioma? */
export async function hasVoiceFor(lang) {
  if (!hasSpeechSynthesis()) return false;
  const voices = await listVoices(lang);
  return voices.length > 0;
}

/** Detiene cualquier locución en curso. */
export function stop() {
  if (!hasSpeechSynthesis()) return;
  window.speechSynthesis.cancel();
}

/**
 * Pronuncia `text` y devuelve una promesa que resuelve al terminar.
 * `voiceURI`: la voz elegida en Ajustes, si existe; si no, la primera del
 * idioma. Siempre cancela cualquier locución pendiente antes de hablar: en
 * iOS encolar locuciones es la forma más fácil de dejar la síntesis colgada.
 *
 * Nota: la primera llamada solo funciona si viene de un gesto del usuario
 * (click/touch). Esto no se puede forzar desde aquí, es responsabilidad de
 * quien llama a speak() desde un manejador de evento.
 */
export async function speak(text, { lang, rate = 1, voiceURI } = {}) {
  if (!hasSpeechSynthesis()) {
    throw new Error('Este dispositivo no soporta síntesis de voz (speechSynthesis).');
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const voices = await voicesReady();
  const utter = new window.SpeechSynthesisUtterance(text);
  utter.lang = LANG_TAG[lang] || lang || '';
  utter.rate = rate;

  let voice = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : null;
  if (!voice && lang) voice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  if (voice) utter.voice = voice;

  return new Promise((resolve, reject) => {
    utter.onend = () => resolve();
    utter.onerror = (ev) => reject(new Error(`Error al reproducir audio (${ev.error || 'desconocido'}).`));
    synth.speak(utter);
  });
}

/** Igual que speak(), a velocidad reducida (0.6) para practicar oído. */
export function speakSlow(text, opts = {}) {
  return speak(text, { ...opts, rate: 0.6 });
}
