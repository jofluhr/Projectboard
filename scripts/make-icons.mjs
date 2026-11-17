// Generates the PWA icons (public/icon-192.png, public/icon-512.png) without image libraries.
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const ACCENT = [0x1c, 0x6a, 0x8c]
const CARD = [0xff, 0xff, 0xff]
const COLUMN = [0x5f, 0x9d, 0xba]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size)
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1

// Full-bleed accent square (safe for maskable icons) with three columns of cards,
// kept inside the central 60% safe zone.
function pixel(x, y) {
  const cols = [0.22, 0.42, 0.62]
  const w = 0.16
  const cards = [[0.24, 0.36, 0.48, 0.6], [0.24, 0.36], [0.24, 0.36, 0.48]]
  for (let i = 0; i < 3; i++) {
    const x0 = cols[i]
    if (!inRect(x, y, x0, 0.2, x0 + w, 0.8)) continue
    for (const top of cards[i]) if (inRect(x, y, x0 + 0.015, top, x0 + w - 0.015, top + 0.09)) return CARD
    return COLUMN
  }
  return ACCENT
}

for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, png(size, pixel))
console.log('Icons written')
