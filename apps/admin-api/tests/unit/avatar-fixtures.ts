/**
 * Picture fixtures for the avatar tests. Nothing decodes an avatar — the
 * console stores and serves the bytes as they are — so what matters is the
 * leading magic bytes; the PNG is nonetheless a real 1x1 image.
 */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** SOI + APP0 (JFIF) marker, then filler. */
export const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
  Buffer.alloc(64, 0x11),
])

/** RIFF <size> WEBP VP8 chunk header, then filler. */
export const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(40, 0x22),
])

export const GIF = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1')

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>',
)

/** A PNG whose total size is exactly `bytes`. */
export function pngOfSize(bytes: number): Buffer {
  return Buffer.concat([PNG_1X1.subarray(0, 8), Buffer.alloc(bytes - 8, 0x33)])
}

export function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`
}
