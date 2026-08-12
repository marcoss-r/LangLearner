// js/screens/settings.js — pantalla "Ajustes" (#/settings).
// Todo cambio se guarda al momento con store.updateSettings() y confirma con
// un toast: no hay botón "Guardar" en toda la pantalla.
import { h, toast, confirmDialog } from '../ui.js';
import * as store from '../store.js';
import * as audio from '../audio.js';
import { screenHeader } from './parts.js';

const SAMPLE_PHRASE = {
  fr: "Bonjour, comment ça va aujourd'hui ?",
  de: 'Guten Tag, wie geht es dir heute?',
};
const LANG_LABEL = { fr: 'francés', de: 'alemán' };

export function render() {
  const el = h('div', { class: 'screen-settings' }, []);
  el.appendChild(screenHeader({ title: 'Ajustes' }));
  el.appendChild(voiceSection('fr'));
  el.appendChild(voiceSection('de'));
  el.appendChild(rateSection());
  el.appendChild(togglesSection());
  el.appendChild(goalSection());
  el.appendChild(updateSection());
  el.appendChild(backupSection());
  el.appendChild(dangerSection());
  return el;
}

/* ---------- Voz TTS por idioma ---------- */

function voiceSection(lang) {
  const voiceKey = lang === 'fr' ? 'ttsVoiceFr' : 'ttsVoiceDe';

  const select = h(
    'select',
    { class: 'settings-select', 'aria-label': `Voz de ${LANG_LABEL[lang]}`, lang },
    [h('option', { value: '' }, ['Cargando voces…'])]
  );
  select.disabled = true;

  const testBtn = h('button', { type: 'button', class: 'btn btn--secondary' }, ['▶ Probar']);
  testBtn.disabled = true;

  const hint = h('p', { class: 'text-dim settings-voice-hint' }, []);

  testBtn.addEventListener('click', () => {
    const rate = store.getSettings().ttsRate;
    const voiceURI = select.value || undefined;
    audio.speak(SAMPLE_PHRASE[lang], { lang, rate, voiceURI }).catch((err) => toast(err.message, 'err'));
  });

  audio
    .listVoices(lang)
    .then((voices) => {
      select.innerHTML = '';
      if (voices.length === 0) {
        select.appendChild(h('option', { value: '' }, ['Sin voces instaladas']));
        hint.textContent =
          `No hay ninguna voz de ${LANG_LABEL[lang]} instalada en este dispositivo. En el iPhone: ` +
          `Ajustes → Accesibilidad → Contenido hablado → Voces, y descarga una voz de ${LANG_LABEL[lang]}.`;
        return;
      }
      const current = store.getSettings()[voiceKey];
      const hasCurrent = voices.some((v) => v.voiceURI === current);
      for (const v of voices) {
        select.appendChild(
          h('option', { value: v.voiceURI, selected: hasCurrent ? v.voiceURI === current : v === voices[0] }, [`${v.name} (${v.lang})`])
        );
      }
      select.disabled = false;
      testBtn.disabled = false;
      select.addEventListener('change', () => {
        store.updateSettings({ [voiceKey]: select.value || null });
        toast('Voz guardada', 'ok');
      });
      // Si no había ninguna voz guardada todavía, deja fijada la primera para
      // que "Probar" y el resto de la app usen siempre una voz concreta.
      if (!hasCurrent) store.updateSettings({ [voiceKey]: voices[0].voiceURI });
    })
    .catch((err) => {
      select.innerHTML = '';
      select.appendChild(h('option', { value: '' }, ['No se pudo cargar la lista de voces']));
      hint.textContent = err.message;
    });

  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, [`Voz de ${LANG_LABEL[lang]}`]),
    h('div', { class: 'settings-voice-row' }, [select, testBtn]),
    hint,
  ]);
}

/* ---------- Velocidad ---------- */

function rateSection() {
  const settings = store.getSettings();
  const valueLabel = h('span', { class: 'settings-range-value' }, [settings.ttsRate.toFixed(2)]);
  const input = h('input', {
    type: 'range',
    min: '0.5',
    max: '1.2',
    step: '0.05',
    value: String(settings.ttsRate),
    class: 'settings-range',
    'aria-label': 'Velocidad de la voz',
    onInput: (ev) => {
      valueLabel.textContent = Number(ev.target.value).toFixed(2);
    },
    onChange: (ev) => {
      store.updateSettings({ ttsRate: Number(ev.target.value) });
      toast('Velocidad guardada', 'ok');
    },
  });
  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Velocidad de la voz']),
    h('div', { class: 'settings-range-row' }, [input, valueLabel]),
    h('p', { class: 'text-dim' }, ['0.5 = muy lento · 1.2 = rápido, casi nativo']),
  ]);
}

/* ---------- Interruptores ---------- */

function toggleRow(label, key, settings) {
  const input = h('input', {
    type: 'checkbox',
    class: 'switch__input',
    checked: !!settings[key],
    onChange: (ev) => {
      store.updateSettings({ [key]: ev.target.checked });
      toast('Ajuste guardado', 'ok');
    },
  });
  return h('label', { class: 'settings-toggle tap-target' }, [
    h('span', {}, [label]),
    h('span', { class: 'switch' }, [input, h('span', { class: 'switch__track', 'aria-hidden': 'true' }, [])]),
  ]);
}

function togglesSection() {
  const settings = store.getSettings();
  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Preferencias de estudio']),
    toggleRow('Mostrar transcripción IPA', 'showIpa', settings),
    toggleRow('Mostrar aproximación en castellano', 'showEsApprox', settings),
    toggleRow('Reproducir audio automáticamente', 'autoPlayAudio', settings),
  ]);
}

/* ---------- Objetivo diario ---------- */

function goalSection() {
  const settings = store.getSettings();
  const input = h('input', {
    type: 'number',
    inputmode: 'numeric',
    min: '5',
    max: '120',
    step: '5',
    value: String(settings.dailyGoalMin),
    class: 'settings-goal-input',
    'aria-label': 'Objetivo diario en minutos',
    onChange: (ev) => {
      const v = Math.max(5, Math.min(120, Math.round(Number(ev.target.value)) || 15));
      ev.target.value = String(v);
      store.updateSettings({ dailyGoalMin: v });
      toast('Objetivo diario guardado', 'ok');
    },
  });
  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Objetivo diario']),
    h('div', { class: 'settings-goal-row' }, [input, h('span', { class: 'text-dim' }, ['minutos al día'])]),
  ]);
}

/* ---------- Buscar actualizaciones ---------- */

function updateSection() {
  const status = h('p', { class: 'text-dim' }, ['Comprueba si hay una versión nueva de la app.']);
  const btn = h('button', { type: 'button', class: 'btn btn--secondary btn--block' }, ['Buscar actualizaciones']);

  btn.addEventListener('click', async () => {
    if (!('serviceWorker' in navigator)) {
      toast('Este navegador no soporta Service Worker', 'warn');
      return;
    }
    btn.disabled = true;
    status.textContent = 'Buscando…';
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        status.textContent = 'La app todavía no está registrada como PWA.';
        btn.disabled = false;
        return;
      }
      await reg.update();
      if (reg.waiting) {
        status.textContent = 'Hay una versión nueva. Actualizando…';
        // Al activarse la versión nueva el navegador dispara "controllerchange":
        // ese es el momento seguro para recargar, no antes.
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        status.textContent = 'Ya tienes la última versión.';
        toast('Ya tienes la última versión', 'ok');
        btn.disabled = false;
      }
    } catch (err) {
      status.textContent = `No se pudo comprobar: ${err.message}`;
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });

  return h('section', { class: 'card' }, [h('h2', { class: 'card__title' }, ['Actualizaciones']), status, btn]);
}

/* ---------- Copia de seguridad ---------- */

function backupSection() {
  const exportBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--block' }, ['Exportar copia de seguridad']);
  exportBtn.addEventListener('click', () => {
    const backup = store.exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `langlearner-backup-${new Date().toISOString().slice(0, 10)}.json` }, []);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Copia de seguridad descargada', 'ok');
  });

  const fileInput = h('input', { type: 'file', accept: 'application/json', class: 'settings-file-input' });
  const importBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--block' }, ['Importar copia de seguridad']);
  importBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      toast('El archivo no es un JSON válido', 'err');
      return;
    }

    const ok = await confirmDialog({
      title: 'Importar copia de seguridad',
      body: 'Esto sobrescribirá tu progreso, tus tarjetas de repaso y tus ajustes actuales con los del archivo elegido. ¿Continuar?',
      confirmLabel: 'Importar',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;

    try {
      const n = store.importAll(obj);
      toast(`Importadas ${n} claves. Recargando…`, 'ok');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  return h('section', { class: 'card' }, [
    h('h2', { class: 'card__title' }, ['Copia de seguridad']),
    h('p', { class: 'text-dim' }, ['Tu progreso vive solo en este dispositivo. Exporta una copia de vez en cuando por si Safari la borra.']),
    exportBtn,
    importBtn,
    fileInput,
  ]);
}

/* ---------- Reiniciar progreso ---------- */

function dangerSection() {
  const settings = store.getSettings();
  const lang = settings.activeLang === 'de' ? 'de' : 'fr';

  const btn = h('button', { type: 'button', class: 'btn btn--danger btn--block' }, [`Reiniciar progreso de ${LANG_LABEL[lang]}`]);
  btn.addEventListener('click', async () => {
    const first = await confirmDialog({
      title: `¿Reiniciar ${LANG_LABEL[lang]}?`,
      body: 'Vas a borrar tu progreso de clases, tus tarjetas de repaso y tus estadísticas de este idioma. No afecta al otro idioma.',
      confirmLabel: 'Continuar',
      cancelLabel: 'Cancelar',
    });
    if (!first) return;

    const second = await confirmDialog({
      title: 'Esto no se puede deshacer',
      body:
        `Se va a borrar TODO tu progreso de ${LANG_LABEL[lang]}: clases completadas, notas de exámenes y tarjetas de repaso. ` +
        'Si quieres conservarlo, exporta antes una copia de seguridad.',
      confirmLabel: 'Sí, borrar todo',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!second) return;

    store.resetProgress(lang);
    toast(`Progreso de ${LANG_LABEL[lang]} reiniciado`, 'ok');
  });

  return h('section', { class: 'card settings-danger' }, [h('h2', { class: 'card__title' }, ['Zona de peligro']), btn]);
}
