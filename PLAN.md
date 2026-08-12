# LangLearner — Plan de desarrollo

> **Documento maestro.** Lo lee el asistente que construye la app, al empezar cada tanda de trabajo.
> Lee este fichero **entero** antes de escribir una sola línea de código.
> **La app la desarrolla un único asistente, en secuencia.** Sin agentes en paralelo: ver §10.
> Documentos hermanos: [`docs/SPEC-DATOS.md`](docs/SPEC-DATOS.md) (esquema de contenido y ejercicios) y [`docs/CURRICULO.md`](docs/CURRICULO.md) (mapa de clases).

---

## 1. Qué es esto

App web para que **un único usuario, hispanohablante nativo**, aprenda **francés** y **alemán** desde cero hasta un **B1 funcional** (mantener una conversación básica con un nativo).

- Se despliega en **GitHub Pages** (sitio estático, sin backend, sin build step).
- Se usa **añadida a la pantalla de inicio de un iPhone 15** (PWA en modo `standalone`).
- Uso **personal**: no hay cuentas, ni login, ni sincronización en la nube. Todo vive en `localStorage`.

### Decisiones ya cerradas por el usuario — no las reabras

| Decisión | Valor |
|---|---|
| Volumen | **250 clases por idioma** (≈500 en total) |
| Niveles | A1, A2, B1 — con **prueba de nivel** al final de cada uno |
| Audio | **TTS del sistema iOS** (`speechSynthesis`). Sin MP3 pregrabados |
| Speaking | **Shadowing + autoevaluación**, con **aproximaciones fonéticas escritas en castellano** |
| Progreso | Progreso por clase **+ repaso espaciado (SRS)** |
| Estructura | **Una sola app** con selector FR/DE, progreso independiente por idioma |
| Progresión | **Todo desbloqueado** desde el principio, con "ruta sugerida" que indica qué toca |
| Gamificación | **Solo estadísticas reales**. Sin XP, sin medallas, sin racha |
| Diseño | **Tema oscuro fijo, acento azul claro**. Sin modo claro |
| Stack | `index.html` + CSS + JS vanilla (ES modules). Sin frameworks, sin bundler, sin npm en runtime |

---

## 2. Restricciones técnicas verificadas (agosto 2026)

Esto está **comprobado**, no supuesto. No intentes rodearlo.

### ✅ Funciona en PWA standalone en iOS
- `speechSynthesis` (Text-to-Speech con las voces del iPhone).
- Service Worker y caché offline.
- `localStorage`.
- `env(safe-area-inset-*)`.

### ❌ NO funciona en PWA standalone en iOS
- **`SpeechRecognition` / `webkitSpeechRecognition`**: funciona en la pestaña de Safari, **deja de funcionar en cuanto la app se abre desde la pantalla de inicio**. → **No implementes corrección automática de pronunciación. En ninguna fase.**
- `getUserMedia` / `MediaRecorder`: inestables en standalone (funcionan la primera apertura y fallan después). → **No implementes grabación de voz.**

### ⚠️ Trampas de `speechSynthesis` en Safari — hay que gestionarlas explícitamente
1. `getVoices()` devuelve `[]` en la primera llamada. Hay que escuchar `voiceschanged` y cachear el resultado. Implementa una promesa `voicesReady`.
2. La primera locución **exige un gesto del usuario**. Nunca `speak()` en el `load` de una pantalla; siempre tras un `click`/`touch`.
3. Safari no expone todas las voces del sistema. Filtra por `voice.lang.startsWith('fr')` / `'de'` y, si no hay ninguna, muestra un aviso discreto ("Instala una voz francesa en Ajustes → Accesibilidad → Contenido hablado") en vez de fallar en silencio.
4. **La síntesis se queda colgada** si el móvil se bloquea o cambias de app en mitad de una locución. Solución obligatoria: en `visibilitychange` → `speechSynthesis.cancel()`.
5. La calidad de las voces **alemanas en iOS es peor que las francesas**. No es un bug tuyo: no gastes tiempo intentando arreglarlo.

### GitHub Pages
- Límite de repo/sitio: 1 GB. Ancho de banda: 100 GB/mes. Sobra con muchísimo margen (todo es JSON de texto).
- **El sitio vive en un subdirectorio** (`usuario.github.io/LangLearner/`). → **Todas las rutas deben ser relativas** (`./data/...`, `./js/...`). Una sola ruta absoluta (`/data/...`) rompe el despliegue. Esto incluye el `manifest.webmanifest`, el registro del Service Worker y los `import` de módulos.
- Añade un fichero vacío **`.nojekyll`** en la raíz.
- Usa **routing por hash** (`#/lesson/fr-a1-012`). El routing por History API daría 404 en GitHub Pages.

---

## 3. Arquitectura

SPA de una sola página con router por hash, datos en JSON estático cargado bajo demanda.

```
/
├── index.html                  Único HTML. Shell + <main id="app"> vacío
├── manifest.webmanifest
├── sw.js                       Service Worker
├── .nojekyll
├── README.md
├── PLAN.md
├── docs/
│   ├── SPEC-DATOS.md
│   └── CURRICULO.md
├── assets/
│   ├── icon-180.png            apple-touch-icon (iPhone)
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
├── css/
│   ├── base.css                Reset, tokens, tipografía, safe-area, layout raíz
│   ├── components.css          Botones, tarjetas, chips, barras, modal, toast
│   ├── screens.css             Piezas compartidas + Aprender, Curso, Progreso, Ajustes
│   ├── lesson.css              Pantallas de sesión: clase, examen, repaso
│   └── exercises.css           Estilos de los 16 tipos de ejercicio
├── js/
│   ├── app.js                  Bootstrap, router por hash, montaje de pantallas
│   ├── store.js                localStorage: ajustes, progreso, estadísticas, export/import
│   ├── data.js                 Carga y caché en memoria de courses/course/lesson/exam
│   ├── srs.js                  Repaso espaciado (SM-2 simplificado)
│   ├── audio.js                Capa TTS
│   ├── grader.js               Normalización y corrección tolerante de respuestas
│   ├── ui.js                   Helpers DOM (h(), toast, modal, haptics, barra de acentos)
│   ├── screens/
│   │   ├── home.js  course.js  lesson.js  exam.js  review.js  stats.js  settings.js
│   │   ├── parts.js            Piezas comunes a todas las pantallas
│   │   ├── session.js          Común a clase/examen/repaso: shell, pasos, resultados
│   │   └── dev.js              Banco de pruebas oculto (#/dev/exercises)
│   └── exercises/
│       ├── index.js            Registro tipo → renderer
│       ├── shared.js           Infraestructura común a los 16 renderers
│       └── mcq.js  fillBlank.js  translate.js  matchPairs.js  wordOrder.js
│           conjugation.js  listening.js  shadowing.js  speakPrompt.js
│           genderArticle.js  categorize.js  dialogue.js
│           errorCorrection.js  trueFalse.js  oddOneOut.js
└── data/
    ├── courses.json            Índice de idiomas disponibles
    ├── fr/
    │   ├── course.json         Índice de las 250 clases (metadatos, sin contenido)
    │   ├── lessons/fr-a1-001.json … fr-b1-250.json
    │   └── exams/fr-a1.json  fr-a2.json  fr-b1.json
    └── de/  (idéntico)
```

### Principios no negociables
- **Un fichero JSON por clase.** Nunca un mega-fichero. Permite carga perezosa y que cada lote de contenido se escriba, valide y despliegue sin tocar lo ya hecho.
- **`course.json` no contiene ejercicios**, solo metadatos (id, título, nivel, orden, tags, minutos, prerrequisitos). Es lo único que se carga al abrir un idioma.
- **Ningún módulo JS toca `localStorage` directamente** salvo `store.js`.
- **Ningún módulo llama a `speechSynthesis` directamente** salvo `audio.js`.
- Sin dependencias externas. Sin CDNs. Sin `npm install` para que la app funcione (solo para las herramientas de validación, que son opcionales y locales).

---

## 4. Especificación de iOS / PWA (Fase 0, crítica)

### `index.html` — cabecera obligatoria

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="LangLearner">
<meta name="theme-color" content="#0B1220">
<meta name="color-scheme" content="dark">
<link rel="apple-touch-icon" href="./assets/icon-180.png">
<link rel="manifest" href="./manifest.webmanifest">
```

### Safe areas — reglas
Con `viewport-fit=cover` + `black-translucent`, el contenido pasa **por debajo** de la Dynamic Island y del indicador de inicio. Hay que compensarlo siempre con `env()`, **nunca con píxeles fijos**.

```css
:root{
  --sat: env(safe-area-inset-top,  0px);
  --sab: env(safe-area-inset-bottom,0px);
  --sal: env(safe-area-inset-left,  0px);
  --sar: env(safe-area-inset-right, 0px);
}
.app-header  { padding-top: calc(var(--sat) + 8px); }
.app-tabbar  { padding-bottom: calc(var(--sab) + 6px); }
.screen      { padding-left: calc(var(--sal) + 16px); padding-right: calc(var(--sar) + 16px); }
/* La barra inferior de acciones de una clase debe respetar --sab siempre */
```

### Checklist de comportamiento (criterios de aceptación de la Fase 0)
- [ ] Altura raíz con `100dvh` (fallback `-webkit-fill-available`). Nunca `100vh` a secas.
- [ ] `overscroll-behavior-y: contain` en el contenedor con scroll → sin *pull-to-refresh* ni efecto rebote de página.
- [ ] `touch-action: manipulation` global → sin retardo de 300 ms ni zoom por doble toque.
- [ ] `-webkit-touch-callout: none` y `user-select: none` en la interfaz; **`user-select: text` sí en los bloques de explicación y ejemplos**.
- [ ] Todos los `<input>` con `font-size: 16px` mínimo → iOS no hace zoom al enfocar.
- [ ] Todos los `<input>` de respuesta con `autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false"` y `lang="fr"`/`lang="de"`. **Sin esto, el autocorrector de iOS destruye lo que escribe el usuario en francés y alemán.**
- [ ] **Barra de caracteres especiales** encima del teclado al enfocar un input: `é è ê à â ç î ô ù û` (FR) / `ä ö ü ß` (DE). Insertan en la posición del cursor. Es imprescindible: el teclado español obliga a mantener pulsado para cada uno.
- [ ] Área táctil mínima de 44×44 px en todo lo pulsable.
- [ ] Scroll vertical fluido, sin scroll horizontal en ningún punto (376 px de ancho lógico en iPhone 15).
- [ ] Al volver a primer plano (`visibilitychange`), `speechSynthesis.cancel()`.
- [ ] Se puede instalar en pantalla de inicio y arrancar **sin conexión** tras la primera visita.

### `manifest.webmanifest`
```json
{
  "name": "LangLearner",
  "short_name": "LangLearner",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0B1220",
  "theme_color": "#0B1220",
  "icons": [
    { "src": "./assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./assets/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "./assets/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Service Worker
- Constante `CACHE_VERSION` al principio del fichero. **Súbela en cada despliegue con cambios.**
- *App shell* (HTML, CSS, JS, manifest, iconos): **cache-first**, precargado en `install`.
- `data/**.json`: **stale-while-revalidate** (sirve rápido de caché y actualiza en segundo plano).
- `activate` borra cachés de versiones anteriores.
- Ajustes → botón **"Buscar actualizaciones"** que hace `registration.update()` y recarga. Sin él, con cache-first te quedas atrapado en una versión vieja del contenido.

---

## 5. Sistema de diseño

Tema oscuro fijo, acento azul claro. Aire, tipografía grande, tarjetas.

```css
:root{
  /* Fondo y superficies */
  --bg:          #0B1220;
  --surface:     #131C2E;
  --surface-2:   #1A2438;
  --border:      #26314A;

  /* Texto */
  --text:        #E8EDF7;
  --text-dim:    #97A3BE;
  --text-faint:  #667390;

  /* Acento */
  --accent:      #6FB3FF;
  --accent-2:    #A8D3FF;
  --accent-soft: rgba(111,179,255,.14);
  --accent-line: rgba(111,179,255,.35);

  /* Semánticos */
  --ok:   #4ADE80;  --ok-soft:   rgba(74,222,128,.14);
  --err:  #FF6B6B;  --err-soft:  rgba(255,107,107,.14);
  --warn: #FBBF24;  --warn-soft: rgba(251,191,36,.14);

  /* Forma */
  --r-sm: 10px; --r-md: 16px; --r-lg: 22px; --r-full: 999px;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px; --sp-6:32px;

  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
}
```

- **Tipografía**: `--font`. Cuerpo 17 px / interlineado 1.55. Títulos 28/22/19 px, peso 600–700. Texto en idioma extranjero siempre con `lang="fr"`/`lang="de"` y ligeramente más grande o en `--accent-2` para distinguirlo del castellano.
- **Fonética**: aproximación en castellano en cursiva y `--text-dim`; IPA en monoespaciada pequeña.
- **Colores semánticos**: verde solo para acierto, rojo solo para fallo, ámbar para "casi" (respuesta con errata menor).
- **Animaciones**: 150–220 ms, `ease-out`. Nada rebotón. Respeta `prefers-reduced-motion`.
- **Feedback háptico**: `navigator.vibrate` no existe en iOS. No lo uses; el feedback es visual y sonoro.
- **Navegación**: *tab bar* inferior fija con 4 destinos — **Aprender · Repasar · Progreso · Ajustes**. Dentro de una clase, la tab bar se oculta y aparece una barra de acción inferior (Comprobar / Continuar).

---

## 6. Modelo de datos en `localStorage`

Prefijo `ll:v1:`. Todo pasa por `store.js`, que serializa a JSON y tolera claves corruptas (try/catch → valor por defecto).

```
ll:v1:settings
  { activeLang:"fr", ttsRate:0.9, ttsVoiceFr:null, ttsVoiceDe:null,
    showIpa:true, showEsApprox:true, autoPlayAudio:true, dailyGoalMin:15 }

ll:v1:progress:fr
  { lessons: { "fr-a1-012": { status:"done"|"started", bestScore:0.86,
                              attempts:3, lastAt:"2026-08-10T18:02:00Z",
                              sectionsRead:true } },
    exams:   { "fr-a1": { bestScore:0.78, attempts:2, lastAt:"…",
                          byTag:{ "verbos":0.6, "vocabulario":0.9 } } } }

ll:v1:srs:fr
  { cards: { "fr-a1-012::v3": { ef:2.5, interval:6, due:"2026-08-16",
                                reps:4, lapses:1, lastAt:"…" } } }

ll:v1:activity
  { "2026-08-10": { minutes:22, exercises:64, correct:51, lang:{fr:22,de:0} } }
```

**Regla:** al escribir progreso, nunca reemplaces el objeto entero desde una pantalla; usa métodos de `store.js` (`markLessonDone`, `recordAnswer`, `gradeCard`…) que hacen *merge*. Así dos pantallas abiertas no se pisan.

**Copia de seguridad (opcional pero recomendada, Fase 7):** botón en Ajustes que exporta todas las claves `ll:v1:*` a un JSON descargable y otro que lo reimporta. Son ~30 líneas y es el único seguro contra un borrado de datos de Safari o un cambio de móvil.

---

## 7. Pantallas

| Ruta | Pantalla | Contenido |
|---|---|---|
| `#/` | **Aprender** | Selector FR/DE arriba. Tarjeta grande "Continúa por aquí" (ruta sugerida). Progreso por nivel (A1/A2/B1) con barra. Acceso a los 3 exámenes. Recordatorio de cuántas tarjetas hay para repasar hoy |
| `#/course/fr` | **Curso** | Lista de las 250 clases agrupadas por nivel y por bloque, con estado (sin empezar / empezada / completada + nota). Buscador por título o tag. Filtros: nivel, tipo (vocabulario/gramática/fonética), pendientes |
| `#/lesson/fr-a1-012` | **Clase** | Secciones de explicación → ejercicios uno a uno → pantalla de resultados |
| `#/exam/fr-a1` | **Prueba de nivel** | Solo ejercicios, sin explicaciones, sin corrección hasta el final. Informe por competencia |
| `#/review` | **Repasar** | Sesión SRS con las tarjetas vencidas del idioma activo |
| `#/stats` | **Progreso** | Estadísticas reales (ver §9) |
| `#/settings` | **Ajustes** | Voz TTS por idioma + botón de prueba, velocidad, mostrar IPA / aproximación castellana, buscar actualizaciones, exportar/importar, reiniciar progreso (con doble confirmación) |

### Flujo de una clase (el corazón de la app)
1. **Portada**: título, nivel, objetivos ("Al terminar sabrás…"), minutos estimados.
2. **Secciones de teoría**, deslizables, una debajo de otra: explicación, tabla de vocabulario (con ▶ para escuchar cada palabra), tabla gramatical, aviso de fonética, "ojo con esto" (falsos amigos, contraste con el español), nota cultural.
3. Botón **"Empezar ejercicios"**.
4. **Ejercicios de uno en uno**, con barra de progreso arriba. Al responder: corrección inmediata, explicación del porqué si se falla, botón "Escuchar" siempre disponible en frases del idioma meta.
5. Los fallos se **encolan y se repiten** al final de la clase hasta acertarlos.
6. **Resultados**: nota, tiempo, aciertos por tipo de ejercicio, tarjetas añadidas al SRS, botones "Repetir fallos" / "Siguiente clase".

---

## 8. Repaso espaciado (`srs.js`)

SM-2 simplificado. Una tarjeta = un `srsItem` de una clase (palabra, expresión o frase clave; ver [`SPEC-DATOS.md`](docs/SPEC-DATOS.md)).

- Calificación del usuario tras cada tarjeta: **Otra vez / Difícil / Bien / Fácil** → `q = 0 / 3 / 4 / 5`.
- `q < 3` → `interval = 1`, `lapses++`, y la tarjeta vuelve a salir en la misma sesión.
- `q >= 3` → `reps===1 ? 1 : reps===2 ? 3 : round(interval * ef)`.
- `ef = max(1.3, ef + (0.1 - (5-q)*(0.08 + (5-q)*0.02)))`.
- `due = hoy + interval` días.
- Las tarjetas nuevas entran **al completar la clase**, no antes.
- Tope de **40 tarjetas por sesión** de repaso, priorizando las más vencidas.
- La sesión de repaso alterna formatos automáticamente para la misma tarjeta: reconocimiento (ver FR → decir ES), producción (ver ES → escribir FR) y escucha (oír FR → escribir). La producción y la escucha valen más que el reconocimiento.

---

## 9. Estadísticas (`#/stats`)

Sin XP ni medallas. Datos con significado:

- **Palabras dominadas** por idioma = tarjetas SRS con `interval >= 21` días. Desglose por nivel.
- **Cobertura del curso**: clases completadas / 250, por nivel.
- **Precisión por tipo de ejercicio** (barras horizontales): revela si fallas en traducción activa, en géneros, en orden de palabras…
- **Precisión por tag gramatical** (passé composé, dativo, adjetivos…) → lista de "tus 5 puntos débiles" con enlace directo a la clase correspondiente. **Esta es la función más útil de toda la pantalla; priorízala.**
- **Mapa de calor de actividad** de las últimas 12 semanas.
- **Tiempo de estudio** por semana y minutos de hoy frente al objetivo diario.
- Notas de las pruebas de nivel con su desglose por competencia.

---

## 10. Fases de desarrollo

**Modelo de ejecución: un solo asistente, en secuencia.** Nada de agentes en paralelo. Se probó en las Fases 2 y 3 y salió caro sin salir mejor: el trabajo se pagaba dos veces, una cuando el agente verificaba lo suyo y otra cuando había que revisarlo de nuevo para poder responder por ello. A partir de aquí el asistente con el que hablas escribe el código **y** lo verifica, una sola vez y a fondo. Tardar más está asumido y aceptado.

Lo que sí se mantiene es el **troceado**: una fase (o un lote de contenido) por tanda de trabajo. No porque lo pida ningún reparto, sino porque el contexto se agota y la calidad cae en picado cuando se intenta abarcar de más. Si una fase no cabe, se parte en trozos con un punto de corte verificable, se deja el estado por escrito y se sigue en la tanda siguiente.

### Fase 0 — Esqueleto y PWA
Crear `index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, `css/base.css`, `css/components.css`, `js/app.js` (router por hash + montaje), `js/ui.js`, los iconos (SVG generado a PNG o placeholders sólidos con la letra "L" sobre `--bg`).
**Aceptación:** se instala en el iPhone, arranca offline, respeta todas las casillas del §4, navega entre 4 pantallas vacías, sin scroll horizontal, sin zoom al enfocar un input.

### Fase 1 — Núcleo de datos y servicios
`js/store.js`, `js/data.js`, `js/srs.js`, `js/audio.js`, `js/grader.js`. Sin interfaz.
Incluye **una clase de prueba escrita a mano** (`data/fr/lessons/fr-a1-001.json`) y un `data/fr/course.json` con esa única entrada, para poder probar.
**Aceptación:** desde la consola se puede cargar el curso, cargar una clase, corregir una respuesta con tildes y erratas, pronunciar una frase en francés, y guardar/leer progreso.

### Fase 2 — Motor de ejercicios
Los 16 tipos de [`SPEC-DATOS.md`](docs/SPEC-DATOS.md) + `js/exercises/index.js` + `css/exercises.css`.
Cada tipo expone la misma interfaz: `render(exercise, ctx) → { el, check(), reveal(), focus() }`.
**Aceptación:** una pantalla oculta `#/dev/exercises` renderiza un ejemplo de cada tipo y todos corrigen bien, incluidos los casos raros (respuesta vacía, tildes, mayúsculas, `ß`/`ss`, apóstrofos tipográficos).

### Fase 3 — Pantallas
Pantallas de navegación: `home.js`, `course.js`, `stats.js`, `settings.js`.
Pantallas de sesión: `lesson.js` (portada, teoría, ejercicios, resultados), `exam.js`, `review.js`, más `session.js` con lo común a las tres.
**Aceptación:** flujo completo de una clase de principio a fin con la clase de prueba; el progreso persiste tras cerrar y reabrir la app.

### Fase 4 — Currículo A2 y B1 · una tanda por idioma
[`docs/CURRICULO.md`](docs/CURRICULO.md) ya trae **A1 completo (90 clases por idioma)** y el **mapa de bloques de A2 y B1** con inventario gramatical y número de clases por bloque. Esta fase expande A2+B1 a títulos concretos siguiendo la receta del propio documento, y genera `data/fr/course.json` y `data/de/course.json` completos (250 entradas cada uno, solo metadatos).
**Aceptación:** 250 entradas por idioma, `order` correlativo 1–250, sin títulos duplicados, todo prerrequisito apunta a una clase de `order` inferior.

### Fase 5 — Contenido · ~50 tandas (el grueso del trabajo)
Lotes de **10 clases por tanda**, en orden.
Guion de cada lote: *«Lee `docs/SPEC-DATOS.md` y las filas N a N+9 de `docs/CURRICULO.md`. Escribe los 10 ficheros JSON correspondientes. No leas otras clases salvo `fr-a1-001.json` como referencia de formato. Ejecuta `node tools/validate.mjs` al terminar.»*
**Aceptación por lote:** 10 ficheros válidos contra el esquema, ≥15 ejercicios y ≥8 ítems de vocabulario por clase, sin ejercicios que usen gramática todavía no enseñada (respeta `prerequisites`).

### Fase 6 — Pruebas de nivel · una tanda por idioma
6 ficheros: `fr-a1`, `fr-a2`, `fr-b1`, `de-a1`, `de-a2`, `de-b1`. **70 ejercicios** cada uno, seleccionados a mano para cubrir todos los bloques del nivel de forma proporcional, sin repetir literalmente ejercicios de las clases. Sin secciones de teoría. Corrección solo al final, con informe por `tag`.
**Aceptación:** cada ejercicio del examen tiene un `sourceLesson` que existe y pertenece a ese nivel.

### Fase 7 — Pulido, QA y despliegue
- ~~`tools/validate.mjs`~~ **adelantado a la Fase 1**, porque la Fase 5 lo necesita para validar cada lote. Ya existe y funciona.
- **QA lingüística**: pase de revisión sobre muestra aleatoria (ver §11).
- Accesibilidad: contraste ≥4.5:1, foco visible, `aria-live` para los mensajes de corrección, etiquetas en los botones de audio.
- Rendimiento: la pantalla de curso con 250 filas debe ir fluida (renderiza por bloques o usa `content-visibility: auto`).
- Botón "Reportar error" en cada ejercicio: copia al portapapeles `{lessonId, exerciseId, tuRespuesta}` para poder corregir el JSON después.
- Exportar/importar copia de seguridad.
- Despliegue: rama `main`, GitHub Pages, verificación en el iPhone real.

---

## 11. Reglas de contenido

Esto es lo que más determina si la app sirve o no.

1. **Perspectiva del hispanohablante, siempre.** Cada clase debe señalar explícitamente dónde el español ayuda y dónde traiciona. Ejemplos: en francés, `attendre` = esperar (no atender); `nous sommes` ≠ "nosotros somos" en todos los usos. En alemán, el orden de palabras y los casos no tienen equivalente español y hay que explicarlos desde cero, no por analogía.
2. **Nunca metagramática vacía.** Prohibido "el passé composé se usa para acciones pasadas". Sí: "el passé composé es el equivalente casi exacto de *he comido* / *comí* del español; el francés hablado casi no usa el otro pasado simple, así que con esto ya puedes contar todo tu fin de semana".
3. **Aproximación fonética en castellano obligatoria** en todo el vocabulario nuevo, además del IPA. Formato: `esApprox`. Ejemplo francés `beaucoup` → `«bo-CÚ»`, con nota si hay un sonido inexistente en español. Ejemplo alemán `ich` → `«ij» suave, como una j andaluza muy floja, no la j de "jamón"`. Sé concreto, no digas "difícil de reproducir".
4. **Género y plural siempre.** Un sustantivo alemán sin `der/die/das` y sin plural es contenido defectuoso. Un sustantivo francés sin `le/la` (y sin marca de que empieza por vocal) también.
5. **Progresión honesta.** No uses en un ejercicio nada que no se haya enseñado en esa clase o en una anterior (`prerequisites` lo declara). El validador no lo comprueba: hay que llevarlo a mano.
6. **Frases reales, no frases de libro.** "El bolígrafo de mi tía está sobre la mesa" está prohibido. Las frases deben ser cosas que alguien diría de verdad en una conversación.
7. **Español de España.** Vosotros, coger, ordenador, móvil, zumo. El usuario es español.
8. **Riesgo asumido:** el contenido lo genera una IA y en francés/alemán habrá errores puntuales (géneros, preposiciones, auxiliar del Perfekt, régimen verbal). Mitigación: regla 4, el pase de QA de la Fase 7 sobre ≥10 % de las clases de cada nivel, y el botón "Reportar error" dentro de la app.

---

## 12. Riesgos y cómo se gestionan

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Errores lingüísticos en contenido generado | Alto — aprender algo mal | §11 reglas 4 y 8; QA sobre muestra; botón de reporte |
| 500 clases es muchísimo trabajo | Alto — proyecto abandonado a medias | La app es **plenamente usable con las clases que existan**: `course.json` solo lista lo escrito. Empieza por FR A1 (90 clases) y usa la app mientras se escribe el resto |
| Voces alemanas de iOS mediocres | Medio | Selector de voz en Ajustes; velocidad regulable; el `esApprox` compensa |
| Borrado de `localStorage` por Safari | Medio — pierdes el progreso | Exportar/importar copia de seguridad (Fase 7) |
| Caché del SW sirve contenido viejo | Medio | `CACHE_VERSION` + botón "Buscar actualizaciones" |
| Deriva de estilo entre lotes de contenido | Bajo | `fr-a1-001.json` es la referencia canónica de formato; el validador comprueba estructura |

---

## 13. Orden recomendado de ejecución

```
Fase 0 → Fase 1 → Fase 2 → Fase 3 → [app usable con 1 clase]
       → Fase 4 → Fase 5 lotes FR A1 (9 tandas) → [empiezas a estudiar de verdad]
       → Fase 6 examen FR A1 → Fase 5 lotes FR A2/B1 → Fase 6 → 
       → Fase 5 lotes DE → Fase 6 → Fase 7
```

El punto **"empiezas a estudiar de verdad"** llega tras ~13 tandas de trabajo. Todo lo demás es contenido incremental que no rompe nada.
