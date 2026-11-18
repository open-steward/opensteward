import { createHash, createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PASETO_HEADER } from '../src/constants'
import { importPublicKey } from '../src/keys'
import { v4PublicDecode, v4PublicEncode, v4PublicPreAuth, v4PublicVerify } from '../src/paseto'

/** paseto-standard/test-vectors v4.json at the commit recorded in fixtures/README.md. */
const FIXTURE = join(__dirname, 'fixtures', 'paseto-v4.json')
const FIXTURE_SHA256 = '0b72948b65d1f73f574c9ad2aa3481ec27bf8c632f5f6e1596cd41f5b9703387'

interface Vector {
  name: string
  'expect-fail': boolean
  token: string
  payload: string | null
  footer: string
  'implicit-assertion': string
  'public-key'?: string
  'secret-key-pem'?: string
  key?: string
}
const suite = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { name: string; tests: Vector[] }
const utf8 = (s: string) => new TextEncoder().encode(s)
const text = (b: Uint8Array) => new TextDecoder().decode(b)
const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64url')
const byName = (n: string) => suite.tests.find((v) => v.name === n)!
const signing = suite.tests.filter((v) => v.name.startsWith('4-S-'))
const failing = suite.tests.filter((v) => v.name.startsWith('4-F-'))

// The vectors exercise framing only. No claim is evaluated here, which is the equivalent of
// "now overridden": their exp (2022) never matters. 4-E-* are v4.local and do not apply.
describe('official PASETO v4 vectors (paseto-standard/test-vectors, ISC)', () => {
  it('the fixture is the pinned upstream file, byte for byte (do not reformat it)', () =>
    expect(createHash('sha256').update(readFileSync(FIXTURE)).digest('hex')).toBe(FIXTURE_SHA256))
  it('holds 4-S-1..3 and 4-F-1..5', () => {
    expect(suite.name).toBe('PASETO v4 Test Vectors')
    expect(signing.map((v) => v.name)).toEqual(['4-S-1', '4-S-2', '4-S-3'])
    expect(failing.map((v) => v.name)).toEqual(['4-F-1', '4-F-2', '4-F-3', '4-F-4', '4-F-5'])
    expect(failing.every((v) => v['expect-fail'])).toBe(true)
  })

  describe.each(signing)('$name', (v) => {
    const m = utf8(v.payload!)
    const f = utf8(v.footer)
    const i = utf8(v['implicit-assertion'])
    it('re-signing with secret-key-pem reproduces the token byte for byte', () => {
      const sig = sign(null, v4PublicPreAuth(m, f, i), createPrivateKey(v['secret-key-pem']!))
      expect(v4PublicEncode(m, sig, f)).toBe(v.token)
    })
    it('decodes and verifies with public-key', () => {
      const d = v4PublicDecode(v.token)
      if (!d.ok) throw new Error(d.reason)
      expect([text(d.m), text(d.f)]).toEqual([v.payload, v.footer])
      expect(v4PublicVerify(d, importPublicKey(b64(v['public-key']!)), i)).toBe(true)
    })
  })

  it('4-S-3 fails without its implicit assertion (signed, never carried)', () => {
    const v = byName('4-S-3')
    const d = v4PublicDecode(v.token)
    if (!d.ok) throw new Error(d.reason)
    expect(v4PublicVerify(d, importPublicKey(b64(v['public-key']!)), new Uint8Array(0))).toBe(false)
  })

  it.each(['4-F-1', '4-F-3', '4-F-4', '4-F-5'])(
    '%s is refused at the header (not v4.public)',
    (n) =>
      expect(v4PublicDecode(byName(n).token)).toEqual({
        ok: false,
        reason: 'NOT_PASETO_V4_PUBLIC',
      }),
  )

  it.each(failing)('$name is rejected', (v) => {
    const d = v4PublicDecode(v.token)
    // Only 4-F-2 is a v4.public token; if a decoder regression stopped it decoding, this fails
    // instead of silently skipping the one vector that reaches signature verification.
    expect(d.ok).toBe(v.name === '4-F-2')
    if (!d.ok) return
    // 4-F-2 comes with a 32-byte symmetric `key` (v4.local material), not a public key.
    expect(v4PublicVerify(d, importPublicKey(b64(v.key!)), utf8(v['implicit-assertion']))).toBe(
      false,
    )
  })

  it('stricter than the vectors: padding, empty or extra segments, non-canonical trailing bits', () => {
    const s1 = byName('4-S-1').token
    const s2 = byName('4-S-2').token
    for (const bad of [`${s1}=`, `${s2}=`, `${s1}.`, `${s2}.e30`]) {
      expect(v4PublicDecode(bad)).toEqual({ ok: false, reason: 'MALFORMED' })
    }
    const body = s1.slice(PASETO_HEADER.length)
    expect(body.length % 4).toBe(2) // 133 bytes: the last char carries 4 bits Node ignores
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const sibling = A[A.indexOf(body.at(-1)!) ^ 1]!
    const twin = body.slice(0, -1) + sibling
    expect(Buffer.from(twin, 'base64url').equals(Buffer.from(body, 'base64url'))).toBe(true)
    expect(v4PublicDecode(PASETO_HEADER + twin)).toEqual({ ok: false, reason: 'MALFORMED' })
  })
})
