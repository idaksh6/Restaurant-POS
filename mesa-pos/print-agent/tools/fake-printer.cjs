/**
 * Fake LAN ESC/POS printer for testing the agent without hardware.
 * Answers DLE EOT status queries and saves each received raster job as a PNG.
 *
 *   node print-agent/tools/fake-printer.cjs [port=9100] [outDir=./fake-printer-out] [status=ok|paper-out|cover-open|silent]
 */
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const zlib = require('node:zlib')

const port = Number(process.argv[2]) || 9100
const outDir = path.resolve(process.argv[3] || 'fake-printer-out')
const status = process.argv[4] || 'ok'
fs.mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  }))
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function writePng(file, width, height, bitRows, bytesPerRow) {
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0
    for (let x = 0; x < width; x += 1) {
      const on = bitRows[y * bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))
      raw[y * (width + 1) + 1 + x] = on ? 0 : 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 0
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

function statusByte(n) {
  if (status === 'cover-open' && n === 2) return 0x12 | 0x04
  if (status === 'paper-out' && n === 2) return 0x12 | 0x20
  if (status === 'paper-out' && n === 4) return 0x12 | 0x60
  return 0x12
}

let jobNo = 0
net
  .createServer((socket) => {
    const chunks = []
    socket.on('data', (data) => {
      chunks.push(data)
      for (let i = 0; i + 2 < data.length; i += 1) {
        if (data[i] === 0x10 && data[i + 1] === 0x04 && status !== 'silent') socket.write(Buffer.from([statusByte(data[i + 2])]))
      }
    })
    socket.on('end', () => {
      const all = Buffer.concat(chunks)
      const bands = []
      let cut = false
      for (let i = 0; i < all.length; ) {
        if (all[i] === 0x1d && all[i + 1] === 0x76 && all[i + 2] === 0x30) {
          const bpr = all[i + 4] | (all[i + 5] << 8)
          const h = all[i + 6] | (all[i + 7] << 8)
          bands.push({ bpr, h, data: all.subarray(i + 8, i + 8 + bpr * h) })
          i += 8 + bpr * h
        } else {
          if (all[i] === 0x1d && all[i + 1] === 0x56) cut = true
          i += 1
        }
      }
      if (!bands.length) {
        socket.end()
        return
      }
      jobNo += 1
      const bpr = bands[0].bpr
      const height = bands.reduce((s, b) => s + b.h, 0)
      const file = path.join(outDir, `job-${String(jobNo).padStart(3, '0')}.png`)
      writePng(file, bpr * 8, height, Buffer.concat(bands.map((b) => b.data)), bpr)
      console.log(`job ${jobNo}: ${bpr * 8}x${height} dots, ${all.length} bytes, cut=${cut} → ${file}`)
      socket.end()
    })
    socket.on('error', () => undefined)
  })
  .listen(port, '127.0.0.1', () => console.log(`fake printer on 127.0.0.1:${port} (status=${status}) → ${outDir}`))
