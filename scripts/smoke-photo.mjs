import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { normalizePhotoDataUrl, normalizePhotoAlt, PhotoValidationError } from '@querygraph/verdun/media/photo'

const dataUrl = (type, bytes) => `data:image/${type};base64,${bytes.toString('base64')}`
const specimen = () => sharp({ create: { width: 64, height: 32, channels: 3, background: '#267040' } })

for (const format of ['jpeg', 'png', 'webp']) {
  const bytes = await specimen()[format]().toBuffer()
  const result = await normalizePhotoDataUrl(dataUrl(format, bytes))
  const decoded = await sharp(result.buffer).metadata()
  assert.equal(result.contentType, 'image/webp')
  assert.equal(decoded.format, 'webp')
  assert.equal(result.width, 64)
  assert.equal(result.height, 32)
  assert.equal(result.bytes, result.buffer.length)
  assert.equal(result.sha256, createHash('sha256').update(result.buffer).digest('hex'))
  assert.ok(result.bytes <= 2 * 1024 * 1024)
  assert.deepEqual((await normalizePhotoDataUrl(dataUrl(format, bytes))).buffer, result.buffer, 'normalization is deterministic')
}

const large = await sharp({ create: { width: 4096, height: 3072, channels: 3, background: '#246' } }).jpeg().toBuffer()
const resized = await normalizePhotoDataUrl(dataUrl('jpeg', large))
assert.equal(resized.width, 2048)
assert.equal(resized.height, 1536)

const tagged = await specimen().withMetadata({ orientation: 6 }).withExif({
  IFD0: { Make: 'Verdun-test-camera' },
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 46/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '122/1 25/1 0/1' },
}).jpeg().toBuffer()
const taggedMetadata = await sharp(tagged).metadata()
assert.equal(taggedMetadata.orientation, 6, 'fixture retains EXIF orientation')
assert.ok(taggedMetadata.exif?.includes(Buffer.from('Verdun-test-camera')), 'fixture retains identifying metadata')
// The EXIF GPS IFD pointer (tag 0x8825, little endian) is present in the source.
assert.ok(taggedMetadata.exif?.includes(Buffer.from([0x25, 0x88])), 'fixture contains a GPS IFD')
const stripped = await normalizePhotoDataUrl(dataUrl('jpeg', tagged))
assert.equal(stripped.width, 32)
assert.equal(stripped.height, 64)
const strippedMetadata = await sharp(stripped.buffer).metadata()
for (const property of ['exif', 'icc', 'xmp', 'iptc', 'orientation']) assert.equal(strippedMetadata[property], undefined, `${property} stripped`)
assert.ok(!stripped.buffer.includes(Buffer.from('Verdun-test-camera')))

async function rejects(value, code, statusCode = 400) {
  await assert.rejects(normalizePhotoDataUrl(value), (error) => error instanceof PhotoValidationError && error.code === code && error.statusCode === statusCode)
}
await rejects(undefined, 'PHOTO_INVALID')
await rejects({ imageDataUrl: 'not text' }, 'PHOTO_INVALID')
await rejects('https://example.test/photo.jpg', 'PHOTO_FORMAT')
await rejects('data:image/svg+xml;base64,PHN2Zy8+', 'PHOTO_FORMAT')
await rejects('data:image/png;base64,aGk=', 'PHOTO_INVALID')
await rejects('data:image/jpeg;base64,YQ', 'PHOTO_INVALID')
await rejects('data:image/jpeg;base64,YQ===', 'PHOTO_FORMAT')
await rejects('data:image/jpeg;base64,Y R==', 'PHOTO_FORMAT')
await rejects('data:image/jpeg;base64,YR==', 'PHOTO_INVALID') // Noncanonical trailing bits.
await rejects(dataUrl('png', await specimen().jpeg().toBuffer()), 'PHOTO_FORMAT')
await rejects(dataUrl('jpeg', await specimen().png().toBuffer()), 'PHOTO_FORMAT')
await rejects(dataUrl('jpeg', Buffer.alloc(2 * 1024 * 1024 + 1)), 'PHOTO_TOO_LARGE', 413)
const frames = Buffer.alloc(32 * 64 * 3)
frames.fill(255, 32 * 32 * 3)
const animated = await sharp(frames, { raw: { width: 32, height: 64, pageHeight: 32, channels: 3 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
assert.equal((await sharp(animated).metadata()).pages, 2)
await rejects(dataUrl('webp', animated), 'PHOTO_FORMAT')
const truncated = (await specimen().png().toBuffer()).subarray(0, 40)
await rejects(dataUrl('png', truncated), 'PHOTO_INVALID')

// A tiny PNG claiming a huge raster exercises the decoder limit without
// allocating the claimed 300 million pixels in the test process.
const bomb = Buffer.from(await specimen().png().toBuffer())
bomb.writeUInt32BE(20_000, 16)
bomb.writeUInt32BE(15_000, 20)
bomb.writeUInt32BE(crc32(bomb.subarray(12, 29)), 29)
await rejects(dataUrl('png', bomb), 'PHOTO_TOO_LARGE', 413)

assert.equal(normalizePhotoAlt(undefined), '')
assert.equal(normalizePhotoAlt('  A\n green\u0000 leaf.  '), 'A green leaf.')
assert.equal(Array.from(normalizePhotoAlt('🍃'.repeat(241))).length, 240)
assert.equal(normalizePhotoAlt('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>', 'description stays plain text for app escaping')
assert.throws(() => normalizePhotoAlt({}), PhotoValidationError)
console.log('photo media smoke passed: JPEG/PNG/WebP, exact bytes/hash, resize, EXIF/GPS/orientation, malformed/spoofed input, byte and pixel limits')

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
