# LangLearner

App web personal para aprender **francés** y **alemán** desde cero hasta un
**B1 funcional**, pensada para instalarse en la pantalla de inicio de un
iPhone como PWA. Sin backend, sin cuentas: todo el progreso vive en
`localStorage` del dispositivo.

Es un sitio estático: `index.html` + CSS + JS con módulos ES nativos, sin
frameworks, sin bundler y sin dependencias en tiempo de ejecución. El
documento [`PLAN.md`](./PLAN.md) es la referencia completa de arquitectura y
decisiones de producto.

## Estado actual

Las **Fases 0 a 5** están completas: el esqueleto de la app y la capa PWA,
el núcleo de datos y servicios, el motor de ejercicios, las pantallas, y el
currículo y contenido completo de los dos idiomas — **francés y alemán,
250 clases cada uno (A1, A2 y B1)** — en `data/fr/` y `data/de/`, validados
contra `docs/SPEC-DATOS.md` con `node tools/validate.mjs`.

Queda pendiente la **Fase 6** (pruebas de nivel: 6 ficheros de examen, uno
por idioma y nivel, en `data/<lang>/exams/`) y la **Fase 7** (pulido, QA
lingüística y despliegue). Ver `PLAN.md` §10 para el detalle de cada fase.

## Cómo probar en local

No hace falta Node ni ninguna instalación para ejecutar la app: es HTML/CSS/JS
servido tal cual. Sí hace falta un servidor HTTP local (no vale abrir
`index.html` con `file://`, porque los módulos ES y el Service Worker
requieren `http(s)://`).

Con Python 3 (recomendado, viene instalado en casi cualquier sistema):

```bash
python -m http.server 8000
```

Alternativas equivalentes:

```bash
# Node, sin instalar nada globalmente
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Luego abre `http://localhost:8000/` en el navegador. Para probar el
comportamiento de PWA real (instalación, `standalone`, safe areas) hace falta
abrirlo en Safari de un iPhone real y "Añadir a pantalla de inicio"; el
simulador de iOS no reproduce fielmente `speechSynthesis` ni las safe areas.

## Despliegue en GitHub Pages

1. Sube el contenido de este repositorio a la rama `main`.
2. En **Settings → Pages**, configura el origen como la rama `main` (carpeta
   raíz `/`).
3. El sitio queda publicado en `https://<usuario>.github.io/LangLearner/`.

Como el sitio vive en un subdirectorio (no en la raíz del dominio), **todas
las rutas del proyecto son relativas** (`./css/...`, `./js/...`,
`./data/...`). No debe añadirse ninguna ruta absoluta que empiece por `/`: el
`manifest.webmanifest`, el registro del Service Worker y los `import` de
módulos dependen de ello para funcionar bajo GitHub Pages.

El fichero `.nojekyll` en la raíz es obligatorio: sin él, GitHub Pages
procesa el sitio con Jekyll e ignora ficheros/carpetas que empiecen por `_`
o con ciertos patrones, lo que puede romper el despliegue.

## Actualizar el Service Worker (`CACHE_VERSION`)

El *app shell* (HTML, CSS, JS, iconos) se sirve con estrategia **cache-first**
desde `sw.js`. Eso significa que, si despliegas cambios en esos ficheros sin
tocar nada más, los usuarios que ya tengan la app instalada **seguirán viendo
la versión antigua** indefinidamente.

Cada vez que despliegues un cambio en el app shell:

1. Abre `sw.js`.
2. Sube el valor de la constante `CACHE_VERSION` (por ejemplo, de `'ll-v1'` a
   `'ll-v2'`).
3. Despliega. En la siguiente visita, el navegador detecta el `sw.js` nuevo,
   lo instala en segundo plano, precachea el shell bajo el nuevo nombre de
   caché y borra las cachés antiguas en `activate`.

Los ficheros de contenido (`data/**.json`) usan **stale-while-revalidate**:
se sirven al instante desde caché y se refrescan en segundo plano en cada
visita, así que normalmente no hace falta subir `CACHE_VERSION` solo por
cambios de contenido. Si necesitas forzar una actualización inmediata sin
esperar a la siguiente visita, la pantalla de Ajustes incluye (a partir de
fases posteriores) un botón "Buscar actualizaciones" que llama a
`registration.update()` y recarga la app.

## Herramientas locales

- `tools/make-icons.mjs`: genera los PNG de `assets/` (iconos de la PWA) a
  partir de formas geométricas, sin dependencias externas. Ejecutar con
  `node tools/make-icons.mjs` solo si hace falta regenerarlos.

Estas herramientas son las únicas partes del proyecto que usan Node, y solo
en local: la aplicación en sí no necesita `npm install` para funcionar.
