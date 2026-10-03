import { createHash } from 'node:crypto'
import sharp from 'sharp'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const MAX_EDGE = 2048

export type PhotoValidationCode = 'PHOTO_INVALID' | 'PHOTO_TOO_LARGE' | 'PHOTO_FORMAT' | 'PHOTO_ALT_INVALID'

export class PhotoValidationError extends Error {
  readonly code: PhotoValidationCode
  readonly statusCode: number

  constructor(message: string, code: PhotoValidationCode = 'PHOTO_INVALID', statusCode = 400) {
    super(message)
    this.name = 'PhotoValidationError'
    this.code = code
    this.statusCode = statusCode
  }
}

export interface NormalizedPhoto {
  buffer: Buffer
  contentType: 'image/webp'
  width: number
  height: number
  bytes: number
  sha256: string
}

/** Decode untrusted photo bytes, check their real format, and strip all metadata. */
export async function normalizePhotoDataUrl(value: unknown): Promise<NormalizedPhoto> {
  if (typeof value !== 'string') throw new PhotoValidationError('Choose a JPEG, PNG, or WebP photo.')
  // Bound the string before matching or allocating decoded bytes.
  if (value.length > Math.ceil(MAX_BYTES / 3) * 4 + 32) {
    throw new PhotoValidationError('The photo must be no larger than 2 MiB.', 'PHOTO_TOO_LARGE', 413)
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) throw new PhotoValidationError('Choose a JPEG, PNG, or WebP photo.', 'PHOTO_FORMAT')
  const encoded = match[2]!
  const input = Buffer.from(encoded, 'base64')
  if (!input.length || input.toString('base64') !== encoded) {
    throw new PhotoValidationError('The photo encoding is invalid.')
  }
  if (input.length > MAX_BYTES) {
    throw new PhotoValidationError('The photo must be no larger than 2 MiB.', 'PHOTO_TOO_LARGE', 413)
  }

  try {
    const decoder = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'warning', sequentialRead: true })
    const metadata = await decoder.metadata()
    const expectedFormat = match[1]!.slice('image/'.length)
    if (metadata.format !== expectedFormat || !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) {
      throw new PhotoValidationError('The photo contents do not match its image type.', 'PHOTO_FORMAT')
    }
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) {
      throw new PhotoValidationError('The photo must contain no more than 40 million pixels.', 'PHOTO_TOO_LARGE', 413)
    }
    if ((metadata.pages ?? 1) > 1) {
      throw new PhotoValidationError('Choose a still photo rather than an animated image.', 'PHOTO_FORMAT')
    }
    // Sharp removes EXIF, GPS, ICC, and other metadata unless explicitly retained.
    const { data, info } = await decoder.rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    if (data.length > MAX_BYTES) {
      throw new PhotoValidationError('The processed photo is too large. Choose a smaller photo.', 'PHOTO_TOO_LARGE', 413)
    }
    return {
      buffer: data,
      contentType: 'image/webp',
      width: info.width,
      height: info.height,
      bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    }
  } catch (error) {
    if (error instanceof PhotoValidationError) throw error
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new PhotoValidationError('The photo must contain no more than 40 million pixels.', 'PHOTO_TOO_LARGE', 413)
    }
    throw new PhotoValidationError('This photo could not be read. Choose another JPEG, PNG, or WebP photo.')
  }
}

/** Descriptions remain plain text; apps must escape them when rendering HTML. */
export function normalizePhotoAlt(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new PhotoValidationError('The photo description must be text.', 'PHOTO_ALT_INVALID')
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 240).join('')
}
