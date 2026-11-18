import { describe, expect, it } from 'vitest'
import { MAX_FOOTER_BYTES, MAX_TOKEN_LENGTH, REVOCATIONS_ASSERTION } from '../src/constants'
import { v4PublicDecode, v4PublicEncode } from '../src/paseto'
import { verifyLicense, verifyRevocationList } from '../src/verify'
import {
  NOW,
  keyMapOf,
  makeKey,
  mint,
  mintRevocations,
  signRaw,
  signRawBytes,
  validPayload,
} from './helpers'

const KEY = makeKey('test1')
const KEYS = keyMapOf(KEY)
const verify = (t: string) => verifyLicense(t, KEYS, NOW)
const reason = (t: string) => {
  const r = verify(t)
  return r.ok ? 'OK' : r.reason
}
const raw = (claims: unknown, o: { footer?: string; assertion?: string } = {}) =>
  signRaw(KEY, JSON.stringify(claims), o.footer, o.assertion)
/** Never throws, even for hostile key maps: Object.hasOwn on this Proxy throws inside the verifier. */
const hostile = new Proxy(
  {},
  {
    getOwnPropertyDescriptor() {
      throw new Error('boom')
    },
  },
)

describe('verifyLicense', () => {
  it('[L7:V01] accepts a valid token', () =>
    expect(verify(mint(validPayload(), KEY))).toEqual({
      ok: true,
      payload: validPayload(),
      kid: 'test1',
    }))
  it('accepts an expired token: expiry is classified by the product (GRACE), not here', () =>
    expect(
      reason(
        mint(
          validPayload({
            iat: '2025-01-01T00:00:00Z',
            nbf: '2025-01-01T00:00:00Z',
            exp: '2026-01-01T00:00:00Z',
          }),
          KEY,
        ),
      ),
    ).toBe('OK'))
  it('[L7:V02] tampered payload (tier upgraded after signing): BAD_SIGNATURE', () => {
    const d = v4PublicDecode(mint(validPayload(), KEY))
    if (!d.ok) throw new Error(d.reason)
    const forged = new TextEncoder().encode(
      new TextDecoder().decode(d.m).replace('"tier":"free"', '"tier":"enterprise"'),
    )
    expect(reason(v4PublicEncode(forged, d.sig, d.f))).toBe('BAD_SIGNATURE')
  })
  it('[L7:V03] wrong signature (another key under a trusted kid): BAD_SIGNATURE', () => {
    expect(reason(mint(validPayload(), makeKey('test1')))).toBe('BAD_SIGNATURE')
    // The other key is trusted too, under its own kid (and first in the map): only the key
    // the token's kid names may verify it.
    const other = makeKey('test0')
    const forged = mint(validPayload(), { ...other, kid: 'test1' })
    expect(verifyLicense(forged, keyMapOf(other, KEY), NOW)).toMatchObject({
      ok: false,
      reason: 'BAD_SIGNATURE',
    })
  })
  it.each(['k2026z', 'constructor'])('[L7:V04] unknown kid %s: UNKNOWN_KID', (kid) =>
    expect(reason(mint(validPayload(), makeKey(kid)))).toBe('UNKNOWN_KID'),
  )
  it.each([
    ['too short', 'AAAA'],
    ['a placeholder', 'PLACEHOLDER:test1'],
    ['all-zero', 'A'.repeat(43)],
  ])('unusable key map entry (%s): BAD_KEY, never a throw', (_l, value) =>
    expect(verifyLicense(mint(validPayload(), KEY), { test1: value }, NOW)).toMatchObject({
      ok: false,
      reason: 'BAD_KEY',
    }),
  )
  it.each([
    ['PASETO v2', (t: string) => `v2.public.${t.slice(10)}`],
    ['PASETO v3', (t: string) => `v3.public.${t.slice(10)}`],
    ['v4.local', (t: string) => `v4.local.${t.slice(10)}`],
    ['upper-case header', (t: string) => `V4.PUBLIC.${t.slice(10)}`],
    ['leading space', (t: string) => ` ${t}`],
    [
      'a JWT',
      () => 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsaWNfOGYzazJhYmMifQ.c2lnbmF0dXJl',
    ],
    ['empty string', () => ''],
  ])('[L7:V06] %s: NOT_PASETO_V4_PUBLIC', (_l, make) =>
    expect(reason(make(mint(validPayload(), KEY)))).toBe('NOT_PASETO_V4_PUBLIC'),
  )
  it('trailing newline: MALFORMED (callers trim file contents)', () =>
    expect(reason(`${mint(validPayload(), KEY)}\n`)).toBe('MALFORMED'))
  it('over MAX_TOKEN_LENGTH: TOO_LARGE, before any parsing; exactly at it, parsed', () => {
    expect(reason(`v4.public.${'A'.repeat(MAX_TOKEN_LENGTH)}`)).toBe('TOO_LARGE')
    // 6144 characters: past the cap check, then refused for its missing footer.
    expect(reason(`v4.public.${'A'.repeat(MAX_TOKEN_LENGTH - 10)}`)).toBe('FOOTER_INVALID')
  })
  it('body shorter than a signature: MALFORMED', () =>
    expect(reason('v4.public.AAAA')).toBe('MALFORMED'))
  it('[L7:V07] right key, wrong implicit assertion: BAD_SIGNATURE', () => {
    for (const assertion of ['opensteward-license-v0', '', REVOCATIONS_ASSERTION]) {
      expect(reason(raw(validPayload(), { assertion }))).toBe('BAD_SIGNATURE')
    }
  })
  it.each([
    ['missing', ''],
    ['not JSON', 'arbitrary-string-that-isnt-json'],
    ['an extra claim', '{"kid":"test1","wpk":"x"}'],
    ['a nested value', '{"kid":{"id":"test1"}}'],
    ['an upper-case kid', '{"kid":"Test1"}'],
  ])('footer with %s: FOOTER_INVALID', (_l, footer) =>
    expect(reason(raw(validPayload(), { footer }))).toBe('FOOTER_INVALID'),
  )
  it('footer over MAX_FOOTER_BYTES: FOOTER_INVALID, and only the size check can say so', () => {
    // Valid JSON and a valid {kid} once parsed, correctly signed: only the byte cap rejects it.
    const padded = (n: number) => '{"kid":"test1"' + ' '.repeat(n) + '}'
    expect(Buffer.byteLength(padded(250))).toBe(265)
    expect(reason(raw(validPayload(), { footer: padded(250) }))).toBe('FOOTER_INVALID')
    expect(Buffer.byteLength(padded(241))).toBe(MAX_FOOTER_BYTES)
    expect(reason(raw(validPayload(), { footer: padded(241) }))).toBe('OK')
    expect(reason(raw(validPayload(), { footer: padded(242) }))).toBe('FOOTER_INVALID')
  })
  it('payload not JSON: PAYLOAD_NOT_JSON', () =>
    expect(reason(signRaw(KEY, 'not json'))).toBe('PAYLOAD_NOT_JSON'))
  it('invalid UTF-8 a lenient decoder would turn into JSON: PAYLOAD_NOT_JSON', () =>
    expect(reason(signRawBytes(KEY, Uint8Array.of(0x22, 0xff, 0x22)))).toBe('PAYLOAD_NOT_JSON'))
  it('JSON that is not an object: PAYLOAD_INVALID', () =>
    expect(reason(signRaw(KEY, '[]'))).toBe('PAYLOAD_INVALID'))
  it.each([[2], ['1'], [undefined]])('[L7:V09] ver %j: UNSUPPORTED_VERSION', (ver) =>
    expect(reason(raw({ ...validPayload(), ver }))).toBe('UNSUPPORTED_VERSION'),
  )
  it('ver is checked before the strict schema', () =>
    expect(reason(raw({ ...validPayload(), ver: 2, seats_v2: true }))).toBe('UNSUPPORTED_VERSION'))
  it('other issuer / audience: WRONG_ISSUER / WRONG_AUDIENCE', () => {
    expect(reason(raw({ ...validPayload(), iss: 'evil.dev' }))).toBe('WRONG_ISSUER')
    expect(reason(raw({ ...validPayload(), aud: 'other' }))).toBe('WRONG_AUDIENCE')
  })
  it('[L7:V08] unknown claim (strict): PAYLOAD_INVALID naming unrecognized_keys', () => {
    const r = verify(raw({ ...validPayload(), foo: 1 }))
    expect(r).toMatchObject({ ok: false, reason: 'PAYLOAD_INVALID' })
    expect(r.ok ? '' : r.detail).toContain('unrecognized_keys')
  })
  it('pre-rename limit key (workspaces): PAYLOAD_INVALID', () =>
    expect(reason(raw({ ...validPayload(), limits: { connections: 5, workspaces: 1 } }))).toBe(
      'PAYLOAD_INVALID',
    ))
  it('unknown well-formed features and extra limits pass through (D-D)', () => {
    const r = verify(
      raw({
        ...validPayload(),
        features: ['mcp', 'vertical:hr'],
        limits: { connections: 5, tenants: 1, seats: 10 },
      }),
    )
    expect(r.ok && [r.payload.features, r.payload.limits]).toEqual([
      ['mcp', 'vertical:hr'],
      { connections: 5, tenants: 1, seats: 10 },
    ])
  })
  it('tier and env outside KNOWN_* verify as-is (D-H); a malformed one does not', () => {
    const r = verify(raw({ ...validPayload(), tier: 'team', env: 'staging' }))
    expect(r.ok && [r.payload.tier, r.payload.env]).toEqual(['team', 'staging'])
    expect(reason(raw({ ...validPayload(), tier: 'Team' }))).toBe('PAYLOAD_INVALID')
  })
  it('a signed token with duplicate features verifies, deduplicated (P2)', () => {
    const r = verify(raw({ ...validPayload(), features: ['mcp', 'vertical:crm', 'mcp'] }))
    expect(r.ok && r.payload.features).toEqual(['mcp', 'vertical:crm'])
  })
  it('nbf exactly 5 min ahead is accepted; 5 min 1 s ahead is NOT_YET_VALID', () => {
    const at = (nbf: string) => mint(validPayload({ iat: nbf, nbf }), KEY)
    expect(reason(at('2026-10-09T12:05:00Z'))).toBe('OK')
    expect(reason(at('2026-10-09T12:05:01Z'))).toBe('NOT_YET_VALID')
  })
  it('[L7:V10] nbf at +4 min passes and at +6 min is NOT_YET_VALID', () => {
    const at = (nbf: string) => mint(validPayload({ iat: nbf, nbf }), KEY)
    expect(reason(at('2026-10-09T12:04:00Z'))).toBe('OK')
    expect(reason(at('2026-10-09T12:06:00Z'))).toBe('NOT_YET_VALID')
  })
  it('never throws: non-string token, invalid now, hostile key map', () => {
    expect(verifyLicense(undefined as unknown as string, KEYS, NOW)).toMatchObject({
      ok: false,
      reason: 'MALFORMED',
    })
    expect(verifyLicense(mint(validPayload(), KEY), KEYS, new Date('nope'))).toMatchObject({
      ok: false,
      reason: 'MALFORMED',
    })
    expect(verifyLicense(mint(validPayload(), KEY), hostile, NOW)).toMatchObject({
      ok: false,
      reason: 'MALFORMED',
    })
  })
})

describe('verifyRevocationList', () => {
  const list = {
    ver: 1 as const,
    iat: '2026-10-09T00:00:00Z',
    revoked: ['lic_aaaaaa', 'lic_bbbbbb'],
  }
  const rr = (claims: unknown) => {
    const token = signRaw(KEY, JSON.stringify(claims), undefined, REVOCATIONS_ASSERTION)
    const r = verifyRevocationList(token, KEYS)
    return r.ok ? 'OK' : r.reason
  }
  it('accepts a signed list', () =>
    expect(verifyRevocationList(mintRevocations(list, KEY), KEYS)).toEqual({
      ok: true,
      payload: list,
      kid: 'test1',
    }))
  it('purpose separation, both ways: BAD_SIGNATURE', () => {
    expect(verifyRevocationList(mint(validPayload(), KEY), KEYS)).toMatchObject({
      ok: false,
      reason: 'BAD_SIGNATURE',
    })
    expect(verifyLicense(mintRevocations(list, KEY), KEYS, NOW)).toMatchObject({
      ok: false,
      reason: 'BAD_SIGNATURE',
    })
  })
  it('extra claim: PAYLOAD_INVALID; ver 2: UNSUPPORTED_VERSION', () => {
    expect(rr({ ...list, next: 1 })).toBe('PAYLOAD_INVALID')
    expect(rr({ ...list, ver: 2 })).toBe('UNSUPPORTED_VERSION')
  })
  it('duplicate IDs are dropped, not fatal (P2)', () => {
    const token = signRaw(
      KEY,
      JSON.stringify({ ...list, revoked: ['lic_aaaaaa', 'lic_aaaaaa'] }),
      undefined,
      REVOCATIONS_ASSERTION,
    )
    const r = verifyRevocationList(token, KEYS)
    expect(r.ok && r.payload.revoked).toEqual(['lic_aaaaaa'])
  })
  it('more than MAX_REVOKED (257) IDs: PAYLOAD_INVALID', () =>
    expect(
      rr({
        ...list,
        revoked: Array.from({ length: 257 }, (_, i) => `lic_${String(i).padStart(6, '0')}`),
      }),
    ).toBe('PAYLOAD_INVALID'))
  it('never throws: undefined token, hostile key map', () => {
    expect(verifyRevocationList(undefined as never, KEYS)).toMatchObject({
      ok: false,
      reason: 'MALFORMED',
    })
    expect(verifyRevocationList(mintRevocations(list, KEY), hostile)).toMatchObject({
      ok: false,
      reason: 'MALFORMED',
    })
  })
})
