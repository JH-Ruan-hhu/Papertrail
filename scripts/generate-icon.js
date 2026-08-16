'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const width = 256;
const height = 256;
const pixels = Buffer.alloc(width * height * 4);

function setPixel(x, y, color) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3] ?? 255;
}

function inRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function fillCircle(cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) setPixel(x, y, color);
    }
  }
}

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (inRoundedRect(x, y, 8, 8, 247, 247, 62)) {
      setPixel(x, y, [130, 174, 239, 255]);
    }
  }
}

// Paper silhouette with a folded top-right corner.
for (let y = 47; y <= 210; y += 1) {
  for (let x = 74; x <= 191; x += 1) {
    if (y < 86 && x > 152 + (y - 47)) continue;
    setPixel(x, y, [255, 253, 247, 255]);
  }
}
for (let y = 47; y <= 90; y += 1) {
  for (let x = 152; x <= 191; x += 1) {
    if (y >= x - 105) setPixel(x, y, [220, 235, 255, 255]);
  }
}

fillCircle(107, 151, 13, [49, 95, 159, 255]);
fillCircle(158, 151, 13, [94, 147, 216, 255]);

// Friendly curved mouth made from overlapping circles.
for (let x = 108; x <= 158; x += 1) {
  const normalized = (x - 133) / 25;
  const y = Math.round(181 + 8 * (1 - normalized * normalized));
  fillCircle(x, y, 4, [49, 95, 159, 255]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

const scanlines = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  const outputOffset = y * (width * 4 + 1);
  scanlines[outputOffset] = 0;
  pixels.copy(scanlines, outputOffset + 1, y * width * 4, (y + 1) * width * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0))
]);

const buildDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(path.join(buildDir, 'icon.png'), png);

// ICO files may embed a PNG-compressed 256x256 image. A zero width/height in
// the directory represents 256 pixels.
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt8(0, 6);
icoHeader.writeUInt8(0, 7);
icoHeader.writeUInt8(0, 8);
icoHeader.writeUInt8(0, 9);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png.length, 14);
icoHeader.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([icoHeader, png]));
