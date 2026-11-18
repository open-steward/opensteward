import { sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  assembleToken,
  buildSigningInput,
  MAX_SIGNING_INPUT_BYTES,
  PASETO_HEADER,
  REVOCATIONS_ASSERTION,
  verifyLicense,
  verifyRevocationList,
} from '../src'
import { v4PublicDecode, v4PublicEncode } from '../src/paseto'
import { NOW, keyMapOf, makeKey, mint, mintRevocations, sized, validPayload } from './helpers'

const KEY = makeKey('test1')
const KEYS = keyMapOf(KEY)
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

describe('contract: buildSigningInput + Ed25519 + assembleToken round-trips through verifyLicense', () => {
  it.each([
    ['the handover example', validPayload()],
    ['no label', (({ label: _l, ...rest }) => rest)(validPayload())],
    [
      'future features and limits (D-D)',
      validPayload({
        features: ['mcp', 'vertical:hr', 'sso'],
        limits: { connections: 50, tenants: 3, seats: 10 },
      }),
    ],
    ['a tier and env outside KNOWN_* (D-H)', validPayload({ tier: 'team', env: 'staging' })],
    ['a maximal 4096-byte signing input', sized(4096)],
  ])('[L7:K01] %s', (_l, payload) => {
    const footer = { kid: 'test1' }
    const signature = sign(null, buildSigningInput(payload, footer), KEY.privateKey) // = KMS Sign output
    expect(verifyLicense(assembleToken(payload, footer, signature), KEYS, NOW)).toEqual({
      ok: true,
      payload,
      kid: 'test1',
    })
  })
  it('[L7:K02] fails when any single character is replaced', () => {
    // Body and footer lengths cover every residue mod 3, so two of the tokens end their body
    // and footer in a character with unused trailing bits: a decoder that ignored those bits
    // would accept a changed last character.
    const residues = { body: new Set<number>(), footer: new Set<number>() }
    for (const [kid, label] of [
      ['test1', 'production'],
      ['test12', 'production1'],
      ['test123', 'production12'],
    ] as const) {
      const key = makeKey(kid)
      const token = mint(validPayload({ label }), key)
      const d = v4PublicDecode(token)
      if (!d.ok) throw new Error(d.reason)
      residues.body.add((d.m.length + d.sig.length) % 3)
      residues.footer.add(d.f.length % 3)
      for (let i = 0; i < token.length; i++) {
        const c = token[i]!
        const at = A.indexOf(c)
        for (const r of [A[(at + 1) % 64]!, A[at ^ 1] ?? 'B', '.']) {
          if (r === c) continue
          const mutated = token.slice(0, i) + r + token.slice(i + 1)
          expect(verifyLicense(mutated, keyMapOf(key), NOW).ok, `${kid} ${i}: ${c}->${r}`).toBe(
            false,
          )
        }
      }
    }
    expect([residues.body.size, residues.footer.size]).toEqual([3, 3])
  })
  it('[L7:K02] fails when any single byte of payload, signature or footer changes', () => {
    const d = v4PublicDecode(mint(validPayload(), KEY))
    if (!d.ok) throw new Error(d.reason)
    for (const part of ['m', 'sig', 'f'] as const) {
      for (let i = 0; i < d[part].length; i++) {
        const c = { m: Uint8Array.from(d.m), sig: Uint8Array.from(d.sig), f: Uint8Array.from(d.f) }
        c[part][i]! ^= 0x01
        expect(verifyLicense(v4PublicEncode(c.m, c.sig, c.f), KEYS, NOW).ok, `${part}[${i}]`).toBe(
          false,
        )
      }
    }
  })
  it('authenticates the footer: relabelling to another kid with the same key fails', () => {
    const token = mint(validPayload(), KEY)
    const d = v4PublicDecode(token)
    if (!d.ok) throw new Error(d.reason)
    const sameKeyTwice = { test1: KEY.publicKey, test2: KEY.publicKey }
    expect(verifyLicense(token, sameKeyTwice, NOW).ok).toBe(true)
    const relabelled = v4PublicEncode(d.m, d.sig, new TextEncoder().encode('{"kid":"test2"}'))
    expect(verifyLicense(relabelled, sameKeyTwice, NOW)).toMatchObject({
      ok: false,
      reason: 'BAD_SIGNATURE',
    })
  })
})

describe('revocation list capacity (README formula; P9)', () => {
  // Signing input = PAE overhead 8 + 4*8, header 10, assertion 26 (= 76), footer 10 + len(kid),
  // the empty list's JSON with a whole-second iat (51), then len(sub) + 3 per ID, minus one comma.
  const FIXED = 8 + 4 * 8 + PASETO_HEADER.length + REVOCATIONS_ASSERTION.length
  const EMPTY_LIST_JSON = '{"iat":"2026-10-09T00:00:00Z","revoked":[],"ver":1}'.length
  const capacity = (subLength: number, kid: string) =>
    Math.floor(
      (MAX_SIGNING_INPUT_BYTES - FIXED - (10 + kid.length) - EMPTY_LIST_JSON + 1) / (subLength + 3),
    )
  const ids = (n: number, subLength: number) =>
    Array.from({ length: n }, (_, i) => `lic_${String(i).padStart(subLength - 4, '0')}`)
  const SIGNER = makeKey('k2026a')

  it('the formula constants are what the README says', () =>
    expect([FIXED, EMPTY_LIST_JSON]).toEqual([76, 51]))
  it.each([
    [68, 55], // the longest sub SUB_PATTERN allows: lic_ + 64
    [20, 171], // lic_ + 16
  ])('a %i-character sub: %i IDs fit one list, one more is refused', (subLength, expected) => {
    const n = capacity(subLength, SIGNER.kid)
    expect(n).toBe(expected)
    const footer = { kid: SIGNER.kid }
    const list = { ver: 1 as const, iat: '2026-10-09T00:00:00Z', revoked: ids(n, subLength) }
    expect(buildSigningInput(list, footer, 'revocations').byteLength).toBe(
      FIXED + 10 + SIGNER.kid.length + EMPTY_LIST_JSON - 1 + n * (subLength + 3),
    )
    expect(verifyRevocationList(mintRevocations(list, SIGNER), keyMapOf(SIGNER))).toMatchObject({
      ok: true,
    })
    const oneMore = { ...list, revoked: ids(n + 1, subLength) }
    expect(() => buildSigningInput(oneMore, footer, 'revocations')).toThrow(RangeError)
  })
})
