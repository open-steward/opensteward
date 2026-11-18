import { describe, expect, it } from 'vitest'
import { decodeBase64UrlStrict, encodeBase64Url } from '../src/base64url'

describe('base64url (PASETO: no padding, strict decoding)', () => {
  it('round-trips every length 0..70', () => {
    for (let n = 0; n <= 70; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37) & 255)
      const text = encodeBase64Url(bytes)
      expect(text).not.toContain('=')
      expect(decodeBase64UrlStrict(text)).toEqual(bytes)
    }
  })
  it('encodes a subarray view, not its whole buffer', () => {
    const view = Uint8Array.of(0, 0x61, 0).subarray(1, 2)
    expect(encodeBase64Url(view)).toBe('YQ')
  })
  it('accepts the empty string (empty footer)', () =>
    expect(decodeBase64UrlStrict('')).toEqual(new Uint8Array(0)))
  it("decodes 'YQ' to 'a'", () => expect(decodeBase64UrlStrict('YQ')).toEqual(Uint8Array.of(0x61)))
  it.each(['YQ==', 'YR', 'ab$cd', 'ab cd', 'ab+/', 'A', 'YQ\n'])(
    'refuses %j (Node alone would accept it)',
    (text) => expect(decodeBase64UrlStrict(text)).toBeNull(),
  )
  it('refuses a non-string without throwing', () =>
    expect(decodeBase64UrlStrict(undefined as unknown as string)).toBeNull())
})
