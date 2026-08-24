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

function fillRoundedRect(left, top, right, bottom, radius, color) {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (inRoundedRect(x, y, left, top, right, bottom, radius)) setPixel(x, y, color);
    }
  }
}

function drawLine(x1, y1, x2, y2, thickness, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    fillCircle(
      Math.round(x1 + (x2 - x1) * ratio),
      Math.round(y1 + (y2 - y1) * ratio),
      thickness,
      color
    );
  }
}

// A pale glass tile with a high-contrast notebook silhouette that remains
// legible when Windows reduces it to a 16–20px taskbar icon.
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (inRoundedRect(x, y, 8, 8, 247, 247, 62)) {
      const shade = Math.round(235 - ((x + y) / (width + height)) * 14);
      setPixel(x, y, [shade - 7, shade + 6, 248, 255]);
    }
  }
}

// Research notebook: white page, soft blue binding, and a rising trail.
fillRoundedRect(55, 43, 201, 215, 29, [83, 145, 171, 255]);
fillRoundedRect(59, 39, 197, 211, 27, [255, 255, 255, 255]);
fillRoundedRect(59, 39, 82, 211, 20, [62, 132, 160, 255]);
fillRoundedRect(75, 39, 82, 211, 3, [62, 132, 160, 255]);

const ink = [27, 103, 134, 255];
const inkSoft = [75, 163, 190, 255];
drawLine(101, 82, 169, 82, 4, inkSoft);
drawLine(101, 105, 151, 105, 4, inkSoft);
drawLine(101, 128, 135, 128, 4, inkSoft);

// Three waypoints form a gentle upward research trajectory.
drawLine(101, 172, 126, 154, 4, ink);
drawLine(126, 154, 151, 164, 4, ink);
drawLine(151, 164, 177, 137, 4, ink);
fillCircle(101, 172, 8, ink);
fillCircle(126, 154, 8, inkSoft);
fillCircle(151, 164, 8, inkSoft);
fillCircle(177, 137, 9, ink);

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

function encodePng(sourceWidth, sourceHeight, sourcePixels) {
  const scanlines = Buffer.alloc((sourceWidth * 4 + 1) * sourceHeight);
  for (let y = 0; y < sourceHeight; y += 1) {
    const outputOffset = y * (sourceWidth * 4 + 1);
    scanlines[outputOffset] = 0;
    sourcePixels.copy(scanlines, outputOffset + 1, y * sourceWidth * 4, (y + 1) * sourceWidth * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(sourceWidth, 0);
  ihdr.writeUInt32BE(sourceHeight, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const png = encodePng(width, height, pixels);

const buildDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(path.join(buildDir, 'icon.png'), png);

// Windows uses the smallest suitable frame for the shell/taskbar. Embed
// actual PNG frames instead of asking Windows to shrink a single 256px image.
const iconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const frames = iconSizes.map((size) => {
  const resized = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x * width / size));
      const sourceY = Math.min(height - 1, Math.floor(y * height / size));
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (y * size + x) * 4;
      pixels.copy(resized, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return { size, data: encodePng(size, size, resized) };
});
const icoHeaderLength = 6 + frames.length * 16;
const icoHeader = Buffer.alloc(icoHeaderLength);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(frames.length, 4);
let frameOffset = icoHeaderLength;
frames.forEach((frame, index) => {
  const offset = 6 + index * 16;
  icoHeader.writeUInt8(frame.size === 256 ? 0 : frame.size, offset);
  icoHeader.writeUInt8(frame.size === 256 ? 0 : frame.size, offset + 1);
  icoHeader.writeUInt8(0, offset + 2);
  icoHeader.writeUInt8(0, offset + 3);
  icoHeader.writeUInt16LE(1, offset + 4);
  icoHeader.writeUInt16LE(32, offset + 6);
  icoHeader.writeUInt32LE(frame.data.length, offset + 8);
  icoHeader.writeUInt32LE(frameOffset, offset + 12);
  frameOffset += frame.data.length;
});
fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([icoHeader, ...frames.map((frame) => frame.data)]));
