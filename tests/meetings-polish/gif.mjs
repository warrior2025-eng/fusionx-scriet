// A small animated-GIF writer for the test recordings: PNG screenshots in, one GIF out.
// Node only (zlib), no packages. Colours go to a fixed 6×7×6 palette, which is plenty
// for screenshots of the meeting room.
import zlib from "node:zlib";

/** An 8-bit RGB or RGBA PNG (what Chrome's screenshots are) to RGBA pixels. */
export function readPng(buf) {
  let at = 8;
  let w = 0, h = 0, type = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const kind = buf.toString("latin1", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      type = data[9];
      if (data[8] !== 8 || (type !== 2 && type !== 6) || data[12] !== 0) throw new Error("unsupported PNG");
    } else if (kind === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

const PALETTE = (() => {
  const out = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) out.push([Math.round((r * 255) / 5), Math.round((g * 255) / 6), Math.round((b * 255) / 5)]);
  while (out.length < 256) out.push([0, 0, 0]);
  return out;
})();
const index = (r, g, b) => Math.round((r * 5) / 255) * 42 + Math.round((g * 6) / 255) * 6 + Math.round((b * 5) / 255);

function lzw(pixels) {
  const out = [];
  let cur = 0, bits = 0, size = 9;
  const put = (code) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(cur & 255);
      cur >>>= 8;
      bits -= 8;
    }
  };
  const CLEAR = 256, END = 257;
  let dict = new Map();
  let next = 258;
  put(CLEAR);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = prefix * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    put(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      put(CLEAR);
      dict = new Map();
      next = 258;
      size = 9;
    }
    prefix = k;
  }
  put(prefix);
  put(END);
  if (bits > 0) out.push(cur & 255);
  return Buffer.from(out);
}

/** frames: PNG buffers of one size; delayMs: per frame (a number or a list). */
export function writeGif(frames, delayMs = 400) {
  const imgs = frames.map(readPng);
  const { w, h } = imgs[0];
  const parts = [Buffer.from("GIF89a", "latin1")];
  const head = Buffer.alloc(7);
  head.writeUInt16LE(w, 0);
  head.writeUInt16LE(h, 2);
  head[4] = 0xf7; // global table, 256 colours
  parts.push(head, Buffer.from(PALETTE.flat()));
  parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0", "latin1"), 0x03, 0x01, 0x00, 0x00, 0x00]));
  imgs.forEach((img, n) => {
    if (img.w !== w || img.h !== h) throw new Error("frames differ in size");
    const idx = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) idx[i] = index(img.px[i * img.bpp], img.px[i * img.bpp + 1], img.px[i * img.bpp + 2]);
    const delay = Math.round((Array.isArray(delayMs) ? delayMs[n] : delayMs) / 10);
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, delay & 255, delay >> 8, 0x00, 0x00]));
    const desc = Buffer.alloc(10);
    desc[0] = 0x2c;
    desc.writeUInt16LE(w, 5);
    desc.writeUInt16LE(h, 7);
    parts.push(desc, Buffer.from([8]));
    const data = lzw(idx);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255);
      parts.push(Buffer.from([chunk.length]), chunk);
    }
    parts.push(Buffer.from([0]));
  });
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}
