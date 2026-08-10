# SPEC-DATOS — Esquema de contenido y ejercicios

> Documento de referencia para los agentes que escriben **clases** (Fase 5) y **exámenes** (Fase 6), y para los que implementan el **motor de ejercicios** (Fase 2).
> Si escribes contenido: lee este fichero y tus filas de [`CURRICULO.md`](CURRICULO.md). **No leas otras clases** (agotan el contexto), salvo `data/fr/lessons/fr-a1-001.json` como referencia de formato.

---

## 1. `data/courses.json`

```json
{
  "version": 1,
  "courses": [
    { "lang": "fr", "name": "Francés", "flag": "🇫🇷", "path": "./data/fr/course.json" },
    { "lang": "de", "name": "Alemán",  "flag": "🇩🇪", "path": "./data/de/course.json" }
  ]
}
```

## 2. `data/<lang>/course.json`

Solo metadatos. **Nunca contenido.** Es lo único que se carga al abrir un idioma, así que debe seguir siendo ligero (<150 KB).

```json
{
  "lang": "fr",
  "name": "Francés",
  "version": 1,
  "levels": [
    { "id": "A1", "name": "A1 — Principiante", "range": [1, 90],   "exam": "fr-a1" },
    { "id": "A2", "name": "A2 — Elemental",    "range": [91, 175], "exam": "fr-a2" },
    { "id": "B1", "name": "B1 — Intermedio",   "range": [176, 250],"exam": "fr-b1" }
  ],
  "blocks": [
    { "id": "fr-a1-b1", "level": "A1", "name": "Primeros pasos", "range": [1, 10] }
  ],
  "lessons": [
    {
      "id": "fr-a1-012",
      "order": 12,
      "level": "A1",
      "block": "fr-a1-b2",
      "title": "Los artículos definidos: le, la, l', les",
      "subtitle": "Cómo decir «el» y «la» en francés",
      "kind": "gramatica",
      "tags": ["articulos", "genero"],
      "estimatedMinutes": 12,
      "prerequisites": ["fr-a1-008"],
      "file": "./data/fr/lessons/fr-a1-012.json"
    }
  ]
}
```

- `kind` ∈ `"gramatica" | "vocabulario" | "fonetica" | "verbos" | "comunicacion" | "cultura" | "repaso"`.
- `tags`: minúsculas, sin tildes, kebab-case (`passe-compose`, `dativo`, `verbos-modales`). Se usan para el diagnóstico de puntos débiles en Estadísticas y en el informe de los exámenes. **Usa siempre etiquetas ya existentes antes de inventar una nueva.**

## 3. Fichero de clase — `data/<lang>/lessons/<id>.json`

```json
{
  "id": "fr-a1-012",
  "lang": "fr",
  "level": "A1",
  "order": 12,
  "title": "Los artículos definidos: le, la, l', les",
  "objectives": [
    "Elegir entre le, la y les según el género y el número",
    "Saber cuándo se usa l' delante de vocal",
    "Reconocer que el francés usa el artículo en sitios donde el español no"
  ],
  "sections": [ ... ],
  "vocab":    [ ... ],
  "exercises":[ ... ],
  "srsItems": [ ... ]
}
```

Mínimos por clase: **3 objetivos**, **3 secciones**, **8 ítems de vocabulario** (excepto clases puramente gramaticales, donde bastan 5), **15 ejercicios** (objetivo: 18–22), **8 `srsItems`**.

---

## 4. Secciones (`sections[]`)

Bloques de teoría que se leen antes de los ejercicios. Se renderizan en orden.

### 4.1 `explanation`
```json
{ "type": "explanation",
  "title": "El francés tiene dos géneros, igual que el español",
  "body": "Párrafo en **markdown ligero** (solo **negrita**, *cursiva*, `código` y saltos de línea).",
  "examples": [
    { "target": "le livre", "es": "el libro", "note": "masculino" },
    { "target": "la table", "es": "la mesa",  "note": "femenino" }
  ] }
```
`examples[].target` es pronunciable con ▶ en la interfaz.

### 4.2 `table` — tabla gramatical o de conjugación
```json
{ "type": "table",
  "title": "Los cuatro artículos definidos",
  "headers": ["", "Singular", "Plural"],
  "rows": [ ["Masculino", "le livre", "les livres"],
            ["Femenino",  "la table", "les tables"],
            ["Ante vocal","l'ami / l'école", "les amis"] ],
  "note": "En plural no se distingue el género: siempre les." }
```

### 4.3 `phonetics` — obligatoria en las clases de pronunciación, recomendada en el resto
```json
{ "type": "phonetics",
  "title": "La -s de les no se pronuncia... salvo que siga vocal",
  "body": "…",
  "drills": [
    { "target": "les livres", "ipa": "/le livʁ/",  "esApprox": "«le LIVR»",
      "hint": "la -s desaparece del todo" },
    { "target": "les amis",   "ipa": "/le.z‿ami/", "esApprox": "«le-sa-MÍ»",
      "hint": "aquí la -s reaparece y suena como una s suave: es la liaison" }
  ] }
```

### 4.4 `contrast` — contraste con el español (falsos amigos, trampas)
```json
{ "type": "contrast",
  "title": "Ojo: el francés pone artículo donde el español no",
  "items": [
    { "wrong": "J'aime chocolat", "right": "J'aime le chocolat",
      "why": "En francés los sustantivos casi nunca van desnudos. «Me gusta el chocolate», siempre con artículo." }
  ] }
```

### 4.5 `culture`
```json
{ "type": "culture", "title": "…", "body": "…" }
```

### 4.6 `tip`
```json
{ "type": "tip", "body": "Truco: si la palabra acaba en -tion, -té o -ure, es femenina casi siempre." }
```

---

## 5. Vocabulario (`vocab[]`)

```json
{
  "id": "v3",
  "target": "la fenêtre",
  "es": "la ventana",
  "ipa": "/la fə.nɛtʁ/",
  "esApprox": "«la fe-NETR», la última e casi no se oye",
  "pos": "sustantivo",
  "gender": "f",
  "plural": "les fenêtres",
  "speak": "la fenêtre",
  "example": { "target": "Ouvre la fenêtre, s'il te plaît.", "es": "Abre la ventana, por favor." }
}
```

- `id`: `v1`, `v2`… único dentro de la clase. **No lo cambies nunca después**: es la clave del SRS y renumerar borra el historial de repasos.
- `gender`: `"m" | "f" | "n"` (alemán) o `null` (verbos, adverbios…). **Obligatorio en todo sustantivo.**
- En alemán, `target` incluye el artículo: `"das Fenster"`, y `plural` la forma completa: `"die Fenster"`.
- `esApprox`: **obligatorio siempre**. Sílaba tónica en MAYÚSCULAS. Entre comillas angulares. Añade una nota breve si hay un sonido que no existe en español.
- `speak`: opcional; qué debe pronunciar el TTS si difiere de `target` (p. ej. quitar el artículo o desarrollar una abreviatura).
- `example`: obligatorio salvo en listas cerradas (números, colores, días).

---

## 6. Ejercicios (`exercises[]`)

Campos comunes a todos los tipos:

```json
{ "id": "e7",
  "type": "translate_to_target",
  "tags": ["articulos"],
  "difficulty": 2,
  "explain": "Fenêtre es femenino, por eso la, no le.",
  "audio": "la fenêtre"        // opcional: qué se pronuncia con el botón ▶
}
```
- `id` único en la clase, estable.
- `difficulty` 1–3.
- `explain`: se muestra tras responder, **acierte o falle**. Nunca lo omitas en ejercicios de gramática.

### Distribución obligatoria por clase (mínimo 15 ejercicios)
| Familia | Mínimo | Tipos |
|---|---|---|
| Reconocimiento | 3 | `mcq`, `true_false`, `odd_one_out`, `match_pairs` |
| Producción escrita | 4 | `translate_to_target`, `fill_blank`, `word_order`, `conjugation` |
| Comprensión | 2 | `translate_to_es`, `dialogue`, `listening` |
| Escucha | 2 | `listening` |
| Oral | 2 | `shadowing`, `speak_prompt` |
| Libre | resto | cualquiera |

---

### 6.1 `mcq` — pregunta tipo test
```json
{ "type": "mcq", "prompt": "¿Qué artículo lleva «table»?",
  "options": ["le", "la", "les", "l'"], "answer": 1,
  "explain": "Table es femenino singular → la table." }
```

### 6.2 `true_false`
```json
{ "type": "true_false", "statement": "En plural, «les» sirve para masculino y femenino.",
  "answer": true, "explain": "…" }
```

### 6.3 `fill_blank` — rellena los huecos
```json
{ "type": "fill_blank",
  "prompt": "Completa con le, la, l' o les",
  "text": "___ école est fermée, mais ___ magasins sont ouverts.",
  "blanks": [ { "accept": ["l'", "l’"] }, { "accept": ["les"] } ],
  "bank": ["le", "la", "l'", "les"],
  "explain": "…" }
```
- Cada `___` del `text` corresponde, en orden, a un elemento de `blanks`.
- `bank` opcional: si existe, la interfaz muestra botones en vez de teclado (mejor en móvil para huecos cortos). Incluye 1–2 distractores.

### 6.4 `translate_to_target` — traducir ES → FR/DE
```json
{ "type": "translate_to_target",
  "prompt": "Abre la ventana, por favor.",
  "accept": ["Ouvre la fenêtre, s'il te plaît", "Ouvrez la fenêtre, s'il vous plaît"],
  "hintWords": ["ouvrir", "la fenêtre"],
  "strictAccents": true,
  "explain": "…" }
```
- `accept`: **todas** las variantes razonables (tú/usted, con y sin sujeto, sinónimos). Mínimo 2 cuando exista más de una forma correcta. Es el campo que más determina si el ejercicio frustra o no.
- `strictAccents`: `true` por defecto en francés a partir de A2 y en clases de ortografía; `false` en A1 y en alemán, donde el foco no es la tilde. Si es `false`, una respuesta correcta salvo tildes se acepta como acierto mostrando la forma correcta.
- `hintWords` opcional: se muestran tras un fallo, antes de reintentar.

### 6.5 `translate_to_es` — traducir FR/DE → ES
Igual que el anterior, invertido. `strictAccents` siempre `false`. Sé generoso en `accept`.

### 6.6 `match_pairs` — unir columnas
```json
{ "type": "match_pairs",
  "prompt": "Une cada principio de frase con su final",
  "left":  ["J'ouvre", "Les fenêtres", "L'école"],
  "right": ["la fenêtre.", "sont fermées.", "est grande."],
  "answer": [0, 1, 2],
  "explain": "…" }
```
`answer[i]` = índice en `right` que corresponde a `left[i]`. Barajar `right` en tiempo de ejecución, no en el JSON. Sirve tanto para palabra↔traducción como para principio↔final de frase.

### 6.7 `word_order` — ordenar palabras
```json
{ "type": "word_order",
  "prompt": "Ordena para formar la frase: «Mañana voy al cine con Ana»",
  "tokens": ["Morgen", "gehe", "ich", "mit", "Ana", "ins", "Kino"],
  "answer": ["Morgen", "gehe", "ich", "mit", "Ana", "ins", "Kino"],
  "alsoAccept": [["Ich", "gehe", "morgen", "mit", "Ana", "ins", "Kino"]],
  "explain": "El verbo conjugado va SIEMPRE en segunda posición…" }
```
**Tipo crítico en alemán** (verbo en 2.ª posición, verbo al final con `weil`, separables) y muy útil en francés (posición del adjetivo, pronombres COD/COI, negación). Úsalo generosamente.

### 6.8 `conjugation` — rellenar tabla de conjugación
```json
{ "type": "conjugation",
  "verb": "parler", "tense": "présent",
  "prompt": "Conjuga «parler» en presente",
  "rows": [
    { "person": "je",         "accept": ["parle"] },
    { "person": "tu",         "accept": ["parles"] },
    { "person": "il / elle",  "accept": ["parle"] },
    { "person": "nous",       "accept": ["parlons"] },
    { "person": "vous",       "accept": ["parlez"] },
    { "person": "ils / elles","accept": ["parlent"] }
  ],
  "explain": "Ojo: parle, parles y parlent suenan exactamente igual." }
```

### 6.9 `listening` — dictado / comprensión oral
```json
{ "type": "listening",
  "speak": "Les fenêtres sont ouvertes.",
  "mode": "write",
  "accept": ["Les fenêtres sont ouvertes"],
  "showTextAfter": true,
  "explain": "…" }
```
- `mode: "write"` → escribe lo que oyes. `mode: "choose"` → añade `options[]` y `answer`. `mode: "translate"` → escribe la traducción al español (añade `accept` en español).
- El texto **no se muestra** hasta responder. El botón ▶ es reproducible ilimitadamente; añade un botón "más lento" (`rate 0.6`).

### 6.10 `shadowing` — escuchar y repetir
```json
{ "type": "shadowing",
  "speak": "Est-ce que tu peux ouvrir la fenêtre ?",
  "es": "¿Puedes abrir la ventana?",
  "ipa": "/ɛs.kə ty pø u.vʁiʁ la fə.nɛtʁ/",
  "esApprox": "«es-ke tü pé u-VRIR la fe-NETR»",
  "focus": "La u de «tu» no es la u española: pon la boca para decir «u» pero di «i».",
  "selfAssess": true }
```
Flujo en pantalla: ▶ escuchar → (opcional ▶ lento) → "Dilo en voz alta" → mostrar `esApprox` y `focus` → autoevaluación **Me ha costado / Bien**. No puntúa la nota de la clase; sí alimenta el SRS con la frase.

### 6.11 `speak_prompt` — producción oral guiada
```json
{ "type": "speak_prompt",
  "prompt": "Estás en casa de un amigo y hace calor. ¿Cómo le pides que abra la ventana?",
  "modelAnswer": "Tu peux ouvrir la fenêtre, s'il te plaît ?",
  "alsoValid": ["Ouvre la fenêtre, s'il te plaît."],
  "speak": "Tu peux ouvrir la fenêtre, s'il te plaît ?",
  "selfAssess": true }
```
El usuario lo dice en voz alta **antes** de revelar. Botón "Revelar y escuchar" → autoevaluación.

### 6.12 `gender_article` — género y artículo
```json
{ "type": "gender_article",
  "prompt": "Elige el artículo correcto",
  "items": [
    { "word": "Fenster", "options": ["der","die","das"], "answer": 2, "hint": "diminutivos y -ster…" },
    { "word": "Tür",     "options": ["der","die","das"], "answer": 1 }
  ],
  "explain": "…" }
```
**Obligatorio en toda clase de vocabulario alemana.** En francés, `options: ["le","la"]`.

### 6.13 `categorize` — clasificar en cubos
```json
{ "type": "categorize",
  "prompt": "¿Con haben o con sein?",
  "buckets": ["haben", "sein"],
  "items": [ { "text": "gehen", "bucket": 1 }, { "text": "essen", "bucket": 0 } ],
  "explain": "Los verbos de movimiento y cambio de estado van con sein." }
```
Interacción por toque (tocar ítem → tocar cubo), **no** drag and drop: en iOS el arrastre compite con el scroll.

### 6.14 `dialogue` — completar un diálogo
```json
{ "type": "dialogue",
  "prompt": "Completa la conversación en la panadería",
  "turns": [
    { "who": "Vendeuse", "text": "Bonjour, vous désirez ?", "speak": true },
    { "who": "Toi", "blank": true, "accept": ["Je voudrais une baguette, s'il vous plaît"],
      "hint": "quieres una baguette" },
    { "who": "Vendeuse", "text": "Et avec ceci ?", "speak": true }
  ],
  "explain": "…" }
```

### 6.15 `error_correction` — encuentra el error
```json
{ "type": "error_correction",
  "prompt": "Hay un error. Corrige la frase entera.",
  "wrong": "Je vais à le cinéma.",
  "accept": ["Je vais au cinéma"],
  "explain": "à + le se contrae obligatoriamente en au." }
```

### 6.16 `odd_one_out` — el intruso
```json
{ "type": "odd_one_out",
  "prompt": "¿Cuál no encaja?",
  "options": ["le chat", "le chien", "la table", "le cheval"],
  "answer": 2,
  "explain": "Los demás son animales." }
```

---

## 7. `srsItems[]` — qué entra en el repaso espaciado

Se añaden al mazo **al completar la clase**. Entre 8 y 15 por clase.

```json
{ "id": "s1", "kind": "word",
  "target": "la fenêtre", "es": "la ventana", "esApprox": "«la fe-NETR»",
  "from": "v3" }

{ "id": "s9", "kind": "phrase",
  "target": "Tu peux ouvrir la fenêtre ?", "es": "¿Puedes abrir la ventana?",
  "from": "e11" }
```
- `kind`: `"word" | "phrase"`.
- La clave global de la tarjeta es `"<lessonId>::<id>"` → **nunca reutilices ni renumeres los `id`.**
- Incluye todo el vocabulario nuevo importante + 2–4 frases completas de alto rendimiento (las que realmente diría en una conversación).

---

## 8. Corrección de respuestas (`grader.js`)

Pipeline de normalización, en este orden:

1. `trim()` y colapsar espacios múltiples.
2. Normalizar comillas y apóstrofos tipográficos: `’ ‘ ` → `'`; `« » " "` → `"`.
3. Quitar puntuación **final** (`. ! ? ;`) y espacios antes de `? !` (el francés los escribe, no debe penalizar).
4. `toLowerCase()`.
5. Alemán: equivalencias `ß ↔ ss`, `ä ↔ ae`, `ö ↔ oe`, `ü ↔ ue` (bidireccional, ambas formas se aceptan).
6. Si `strictAccents === false`: quitar diacríticos con `normalize('NFD').replace(/\p{Diacritic}/gu,'')` en ambos lados.

Comparación contra cada elemento de `accept`:
- Igualdad exacta tras normalizar → **acierto** (verde).
- Distancia de Levenshtein ≤ 1 (o ≤ 2 si la respuesta tiene >12 caracteres) → **"casi"** (ámbar): cuenta como acierto en la nota pero muestra la forma correcta resaltando la diferencia, y la tarjeta se marca como "difícil" en el SRS.
- Si solo difiere en diacríticos y `strictAccents === true` → **"casi"**, con el mensaje "cuidado con las tildes".
- Resto → **fallo** (rojo): muestra la primera entrada de `accept` y el `explain`, y encola el ejercicio para repetirlo al final de la clase.

Casos que deben estar cubiertos por pruebas en la Fase 2:
`"Ouvre la fenêtre !"` vs `"ouvre la fenetre"` · `"l’école"` vs `"l'ecole"` · `"Ich heiße Marco"` vs `"ich heisse marco"` · respuesta vacía · respuesta con espacios de sobra · `"Je  vais   au cinéma."`

---

## 9. Fichero de examen — `data/<lang>/exams/<lang>-<level>.json`

```json
{
  "id": "fr-a1",
  "lang": "fr",
  "level": "A1",
  "title": "Prueba de nivel A1 — Francés",
  "passScore": 0.7,
  "estimatedMinutes": 45,
  "exercises": [
    { "id": "x1", "sourceLesson": "fr-a1-012", "tags": ["articulos"], "type": "mcq", "…": "…" }
  ]
}
```
- **70 ejercicios**, repartidos proporcionalmente entre los bloques del nivel.
- Sin `sections`, sin `explain` visible durante la prueba (se muestran todos en el informe final).
- Corrección **solo al terminar**. Informe: nota global, aprobado/suspenso según `passScore`, desglose por `tag` y por familia de ejercicio, y enlaces a las clases de los `tags` con peor resultado.
- No copies ejercicios literales de las clases: mismas estructuras, contenidos nuevos.

---

## 10. Validador — `tools/validate.mjs`

Node sin dependencias, se ejecuta en local: `node tools/validate.mjs`.

Comprueba y **falla con mensaje y ruta exacta** si:
- Falta algún campo obligatorio o hay un `type` desconocido.
- Un `id` de ejercicio, vocabulario o `srsItem` está duplicado dentro de una clase.
- Un `srsItems[].from` apunta a un `id` inexistente.
- Un `answer` está fuera de rango de `options`, o `match_pairs.answer` no es una permutación válida.
- `fill_blank`: el número de `___` en `text` no coincide con `blanks.length`.
- `word_order`: `answer` no es una permutación exacta de `tokens`.
- Una clase tiene <15 ejercicios, <3 secciones o <8 `srsItems`.
- No se cumple la distribución mínima por familia de ejercicio (§6).
- Un `vocab` con `pos: "sustantivo"` no tiene `gender`, o no tiene `esApprox`.
- Una entrada de `course.json` apunta a un fichero que no existe, o al revés.
- `prerequisites` apunta a una clase con `order` mayor o igual.
