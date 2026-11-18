/**
 * The avatar type is decided by magic bytes — never by the sender's claim.
 */
import { describe, expect, it } from 'vitest'
import {
  AVATAR_MAX_BYTES,
  checkAvatarBytes,
  decodeAvatarData,
  sniffAvatarType,
} from '../../src/core/users/avatar-image'
import { GIF, JPEG, PNG_1X1, SVG, WEBP, dataUrl, pngOfSize } from './avatar-fixtures'

describe('sniffAvatarType', () => {
  it('identifies PNG, JPEG and WebP by their signatures', () => {
    expect(sniffAvatarType(PNG_1X1)).toBe('image/png')
    expect(sniffAvatarType(JPEG)).toBe('image/jpeg')
    expect(sniffAvatarType(WEBP)).toBe('image/webp')
  })

  it('refuses SVG, GIF, HTML, a bare RIFF that is not WebP, and truncated headers', () => {
    expect(sniffAvatarType(SVG)).toBeNull()
    expect(sniffAvatarType(GIF)).toBeNull()
    expect(sniffAvatarType(Buffer.from('<!doctype html><script>1</script>'))).toBeNull()
    expect(sniffAvatarType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]))).toBeNull()
    expect(sniffAvatarType(PNG_1X1.subarray(0, 7))).toBeNull()
    expect(sniffAvatarType(Buffer.from([0xff, 0xd8]))).toBeNull()
    expect(sniffAvatarType(Buffer.alloc(0))).toBeNull()
  })
})

describe('checkAvatarBytes', () => {
  it('accepts exactly the cap and refuses one byte more', () => {
    expect(checkAvatarBytes(pngOfSize(AVATAR_MAX_BYTES))).toEqual({ ok: true, contentType: 'image/png' })
    expect(checkAvatarBytes(pngOfSize(AVATAR_MAX_BYTES + 1))).toEqual({ ok: false, reason: 'too_large' })
  })

  it('refuses empty input and an unsupported type', () => {
    expect(checkAvatarBytes(Buffer.alloc(0))).toEqual({ ok: false, reason: 'empty' })
    expect(checkAvatarBytes(SVG)).toEqual({ ok: false, reason: 'unsupported_type' })
  })
})

describe('decodeAvatarData', () => {
  it('decodes plain base64 and data URLs, ignoring the declared media type', () => {
    const plain = decodeAvatarData(PNG_1X1.toString('base64'))
    expect(plain.ok && Buffer.compare(plain.bytes, PNG_1X1)).toBe(0)
    // The claim says SVG; the bytes are a PNG. The claim is dropped here and
    // the sniff decides later.
    const spoofed = decodeAvatarData(dataUrl('image/svg+xml', PNG_1X1))
    expect(spoofed.ok && sniffAvatarType(spoofed.bytes)).toBe('image/png')
  })

  it('refuses non-base64 input and oversize input before decoding it', () => {
    expect(decodeAvatarData('not base64!')).toEqual({ ok: false, reason: 'malformed' })
    expect(decodeAvatarData('data:image/png;base64,')).toEqual({ ok: false, reason: 'malformed' })
    expect(decodeAvatarData('abc')).toEqual({ ok: false, reason: 'malformed' })
    const huge = pngOfSize(AVATAR_MAX_BYTES + 3).toString('base64')
    expect(decodeAvatarData(huge)).toEqual({ ok: false, reason: 'too_large' })
  })
})
