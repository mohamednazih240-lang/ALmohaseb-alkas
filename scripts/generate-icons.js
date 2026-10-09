import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCrcTable();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function generatePNG(width, height, isMaskable = false) {
  // Generate RGBA buffer
  const raw = Buffer.alloc((width * 4 + 1) * height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * (isMaskable ? 0.5 : 0.44);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Base background: Slate-900 / Slate-950 gradient
      const dy = (y / height);
      let r = Math.round(15 + dy * 15);
      let g = Math.round(23 + dy * 20);
      let b = Math.round(42 + dy * 25);
      let a = 255;

      // Distance from center
      const dxDist = Math.abs(x - cx);
      const dyDist = Math.abs(y - cy);

      // Squircle / Rounded Rect corner check for non-maskable
      if (!isMaskable) {
        const cornerR = width * 0.22;
        const cornerDistX = Math.max(0, dxDist - (width * 0.5 - cornerR));
        const cornerDistY = Math.max(0, dyDist - (height * 0.5 - cornerR));
        if (cornerDistX * cornerDistX + cornerDistY * cornerDistY > cornerR * cornerR) {
          a = 0; // Transparent outside rounded icon
        }
      }

      if (a > 0) {
        // Inner card emblem
        const innerScale = isMaskable ? 0.72 : 0.82;
        const innerW = width * innerScale;
        const innerH = height * innerScale;
        const inInner = Math.abs(x - cx) < innerW / 2 && Math.abs(y - cy) < innerH / 2;

        if (inInner) {
          // Inner card background
          r = Math.round(r * 1.3);
          g = Math.round(g * 1.3);
          b = Math.round(b * 1.3);

          // Draw 4 financial growth bars (Gold, Emerald, Sky Blue, Violet)
          const barCount = 4;
          const barTotalW = innerW * 0.65;
          const barW = barTotalW / (barCount * 1.5);
          const barStart = cx - barTotalW / 2;

          for (let bIdx = 0; bIdx < barCount; bIdx++) {
            const bx = barStart + bIdx * (barW * 1.5);
            const heights = [0.28, 0.45, 0.62, 0.40]; // relative bar heights
            const bh = innerH * heights[bIdx];
            const byBottom = cy + innerH * 0.25;
            const byTop = byBottom - bh;

            if (x >= bx && x <= bx + barW && y >= byTop && y <= byBottom) {
              if (bIdx === 0) {
                // Gold
                r = 245; g = 158; b = 11;
              } else if (bIdx === 1) {
                // Emerald
                r = 16; g = 185; b = 129;
              } else if (bIdx === 2) {
                // Sky Blue
                r = 59; g = 130; b = 246;
              } else {
                // Violet
                r = 139; g = 92; b = 246;
              }
            }
          }

          // Top badge / shield circle
          const topCx = cx;
          const topCy = cy - innerH * 0.28;
          const topR = innerW * 0.1;
          const distTop = Math.hypot(x - topCx, y - topCy);
          if (distTop <= topR) {
            if (distTop > topR - 3) {
              r = 16; g = 185; b = 129; // emerald ring
            } else {
              r = 255; g = 255; b = 255; // white center
            }
          }
        }
      }

      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatCompressed = zlib.deflateSync(raw, { level: 9 });
  const idatChunk = makeChunk('IDAT', idatCompressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const pubDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(pubDir)) {
  fs.mkdirSync(pubDir, { recursive: true });
}

// Generate 192x192
fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), generatePNG(192, 192, false));
console.log('Created pwa-192x192.png');

// Generate 512x512
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), generatePNG(512, 512, false));
console.log('Created pwa-512x512.png');

// Generate maskable 512x512
fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), generatePNG(512, 512, true));
console.log('Created pwa-maskable-512x512.png');

// Generate apple-touch-icon 180x180
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generatePNG(180, 180, false));
console.log('Created apple-touch-icon.png');

// Copy 192 as favicon.ico
fs.copyFileSync(path.join(pubDir, 'apple-touch-icon.png'), path.join(pubDir, 'favicon.ico'));
console.log('Created favicon.ico');
