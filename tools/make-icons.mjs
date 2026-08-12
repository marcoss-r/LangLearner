// tools/make-icons.mjs
// Genera los iconos PNG de LangLearner sin dependencias externas: construye
// el fichero PNG a mano (firma, IHDR, IDAT deflate vía zlib nativo, IEND,
// con CRC32 calculado manualmente) a partir de un buffer RGBA rasterizado
// con formas geométricas simples (rectángulos).
//
// Uso: node tools/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const BG = hexToRgb('#0B1220');
const ACCENT = hexToRgb('#6FB3FF');

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

/* ---------------- Rasterizado ---------------- */

class Canvas {
  constructor(size) {
    this.size = size;
    // RGBA, sin canal alfa transparente: todo el lienzo es opaco (fondo sólido).
    this.data = Buffer.alloc(size * size * 4);
  }

  fill(color) {
    for (let i = 0; i < this.size * this.size; i++) {
      this.setPixel(i % this.size, Math.floor(i / this.size), color);
    }
  }

  setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const idx = (y * this.size + x) * 4;
    this.data[idx] = color.r;
    this.data[idx + 1] = color.g;
    this.data[idx + 2] = color.b;
    this.data[idx + 3] = 255;
  }

  // Rectángulo relleno con esquinas opcionalmente redondeadas (radius en px).
  fillRect(x0, y0, w, h, color, radius = 0) {
    const x1 = x0 + w;
    const y1 = y0 + h;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        if (radius > 0 && !inRoundedRect(x + 0.5, y + 0.5, x0, y0, x1, y1, radius)) continue;
        this.setPixel(x, y, color);
      }
    }
  }
}

function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  // Distancia al rectángulo con esquinas recortadas por círculos de radio r.
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r + 0.5;
}

/**
 * Dibuja la marca de LangLearner: dos barras geométricas formando una "L"
 * en --accent sobre el fondo --bg, ya rellenado previamente.
 * `marginRatio` controla el margen de seguridad alrededor de la marca
 * (0.25 en iconos normales, 0.20 en el maskable tal como pide el encargo).
 */
function drawMark(canvas, marginRatio) {
  const S = canvas.size;
  const margin = S * marginRatio;
  const markSize = S - margin * 2;
  const thickness = markSize * 0.30;
  const radius = thickness * 0.28;

  // Barra vertical (el trazo largo de la L).
  canvas.fillRect(margin, margin, thickness, markSize, ACCENT, radius);
  // Barra horizontal (la base de la L).
  canvas.fillRect(margin, margin + markSize - thickness, markSize, thickness, ACCENT, radius);
}

function buildIcon(size, { maskable = false } = {}) {
  const canvas = new Canvas(size);
  canvas.fill(BG);
  drawMark(canvas, maskable ? 0.20 : 0.25);
  return canvas;
}

/* ---------------- Codificación PNG ---------------- */

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Tabla de CRC32 (implementación manual, sin dependencias).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function encodePng(canvas) {
  const { size, data } = canvas;

  // IHDR: ancho, alto, profundidad de bit 8, tipo de color 6 (RGBA),
  // compresión 0, filtro 0, entrelazado 0.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Datos crudos: cada fila lleva un byte de filtro (0 = sin filtro) delante.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filtro "None"
    data.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- Verificación básica ---------------- */

function assertValidPng(buf, label) {
  const sig = buf.subarray(0, 8);
  if (!sig.equals(PNG_SIGNATURE)) {
    throw new Error(`${label}: cabecera PNG inválida (magic bytes incorrectos)`);
  }
  const ihdrType = buf.subarray(12, 16).toString('ascii');
  if (ihdrType !== 'IHDR') {
    throw new Error(`${label}: primer chunk no es IHDR`);
  }
  const iendType = buf.subarray(buf.length - 8, buf.length - 4).toString('ascii');
  if (iendType !== 'IEND') {
    throw new Error(`${label}: falta el chunk IEND`);
  }
}

/* ---------------- Generación de ficheros ---------------- */

function main() {
  mkdirSync(ASSETS_DIR, { recursive: true });

  const targets = [
    { file: 'icon-180.png', size: 180, maskable: false },
    { file: 'icon-192.png', size: 192, maskable: false },
    { file: 'icon-512.png', size: 512, maskable: false },
    { file: 'icon-maskable-512.png', size: 512, maskable: true },
  ];

  for (const { file, size, maskable } of targets) {
    const canvas = buildIcon(size, { maskable });
    const png = encodePng(canvas);
    assertValidPng(png, file);

    const outPath = join(ASSETS_DIR, file);
    writeFileSync(outPath, png);
    console.log(`OK  ${file}  (${size}x${size}, ${png.length} bytes, maskable=${maskable})`);
  }
}

main();
