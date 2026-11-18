import { describe, expect, it } from 'vitest'
import {
  FooterSchema,
  LicensePayloadSchema,
  RevocationPayloadSchema,
  toClaimTime,
} from '../src/schema'
import { validPayload } from './helpers'

const ok = (p: unknown) => LicensePayloadSchema.safeParse(p).success
const codes = (p: unknown) => {
  const r = LicensePayloadSchema.safeParse(p)
  return r.success ? [] : r.error.issues.map((i) => i.code)
}

describe('LicensePayloadSchema', () => {
  it('accepts the handover example (with limits.tenants) unchanged', () =>
    expect(LicensePayloadSchema.parse(validPayload())).toEqual(validPayload()))
  it('label is optional', () => {
    const { label: _label, ...rest } = validPayload()
    expect(ok(rest)).toBe(true)
  })
  it('refuses an unknown top-level claim (strict)', () =>
    expect(codes({ ...validPayload(), jti: 'x' })).toContain('unrecognized_keys'))
  it.each([
    ['iss', 'evil.dev'],
    ['aud', 'other'],
    ['ver', 2],
    ['sub', 'lic_short'],
    ['sub', 'license_8f3k2abc'],
    ['tier', 'Gold'],
    ['tier', ''],
    ['tier', 'pro tier'],
    ['tier', 'x'.repeat(33)],
    ['env', 'PROD'],
    ['env', 'prod\n'],
    ['env', 1],
  ])('refuses %s=%j', (k, v) => expect(ok({ ...validPayload(), [k]: v })).toBe(false))

  describe('tier and env: any lower-case slug (D-H)', () => {
    it.each([
      ['tier', 'team'],
      ['tier', 'enterprise_plus'],
      ['env', 'staging'],
      ['env', 'qa-eu1'],
    ])('accepts %s=%j', (k, v) => expect(ok({ ...validPayload(), [k]: v })).toBe(true))
  })

  describe('features: well-formed strings; unknown ones allowed (D-D); duplicates dropped (P2)', () => {
    it('accepts unknown well-formed features, a 64-character feature and an empty list', () => {
      expect(ok(validPayload({ features: ['mcp', 'vertical:hr', 'sso_v2'] }))).toBe(true)
      expect(ok(validPayload({ features: ['x'.repeat(64)] }))).toBe(true)
      expect(ok(validPayload({ features: [] }))).toBe(true)
    })
    it('drops duplicates, keeping first-seen order', () =>
      expect(
        LicensePayloadSchema.parse(validPayload({ features: ['mcp', 'vertical:crm', 'mcp'] }))
          .features,
      ).toEqual(['mcp', 'vertical:crm']))
    it.each(['Vertical:HR', 'vertical:', 'x'.repeat(65)])('refuses %j', (f) =>
      expect(ok(validPayload({ features: ['mcp', f] }))).toBe(false),
    )
    it('accepts 128 entries and refuses 129', () => {
      const features = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`)
      expect(ok(validPayload({ features: features(128) }))).toBe(true)
      expect(ok(validPayload({ features: features(129) }))).toBe(false)
    })
  })

  describe('limits: connections and tenants required; extra well-formed keys allowed (D-B, D-D)', () => {
    it('accepts extra non-negative integer limits, up to 16 keys in all', () => {
      expect(ok(validPayload({ limits: { connections: 5, tenants: 1, seats: 10 } }))).toBe(true)
      const sixteen = Object.fromEntries([
        ['connections', 1],
        ['tenants', 1],
        ...Array.from({ length: 14 }, (_, i) => [`k${i}`, 1]),
      ])
      expect(ok({ ...validPayload(), limits: sixteen })).toBe(true)
    })
    it('accepts large safe integers (there is no "unlimited" sentinel)', () =>
      expect(
        ok(validPayload({ limits: { connections: Number.MAX_SAFE_INTEGER, tenants: 1_000_000 } })),
      ).toBe(true))
    it.each([
      [{ connections: 5 }],
      [{ connections: 5, workspaces: 1 }],
      [{ connections: -1, tenants: 1 }],
      [{ connections: 1.5, tenants: 1 }],
      [{ connections: '5', tenants: 1 }],
      [{ connections: 2 ** 53, tenants: 1 }],
      [{ connections: 5, tenants: 1, Seats: 1 }],
      [{ connections: 5, tenants: 1, seats: -1 }],
      [
        Object.fromEntries([
          ['connections', 1],
          ['tenants', 1],
          ...Array.from({ length: 15 }, (_, i) => [`k${i}`, 1]),
        ]),
      ],
    ])('refuses %j', (limits) => expect(ok({ ...validPayload(), limits })).toBe(false))
  })

  describe('display text (org, label)', () => {
    it.each([
      '',
      ' Acme',
      'Acme ',
      'Acme\nAB',
      'Acme\u0000AB',
      'Acme\u202eBA',
      'Acme\u2028AB',
      'Acme\u2029AB',
      'Acme\ud800AB',
      'Acme\ue000AB',
      'A'.repeat(201),
    ])('org %j is refused', (org) => expect(ok(validPayload({ org }))).toBe(false))
    it('org is capped at 200, label at 64, and label follows the same rules', () => {
      expect(ok(validPayload({ org: 'A'.repeat(200) }))).toBe(true)
      expect(ok(validPayload({ label: 'x'.repeat(64) }))).toBe(true)
      expect(ok(validPayload({ label: 'x'.repeat(65) }))).toBe(false)
      expect(ok(validPayload({ label: 'prod ' }))).toBe(false)
    })
    it('accepts non-ASCII letters and a surrogate pair', () => {
      expect(ok(validPayload({ org: 'Åkesson & Söner AB' }))).toBe(true)
      expect(ok(validPayload({ org: 'Acme \u{1F680}' }))).toBe(true)
    })
  })

  describe('time claims: RFC 3339, upper-case T and Z, seconds required', () => {
    it.each([
      '2026-10-06T17:00:00+00:00',
      '2026-10-06t17:00:00z',
      '2026-10-06T17:00Z',
      '2026-10-06 17:00:00Z',
      '2026-02-30T00:00:00Z',
    ])('exp %j is refused', (exp) => expect(ok(validPayload({ exp }))).toBe(false))
    it('fractional seconds are accepted', () =>
      expect(ok(validPayload({ exp: '2027-10-06T17:00:00.123Z' }))).toBe(true))
    it('nbf or iat after exp is refused', () => {
      expect(ok(validPayload({ nbf: '2028-01-01T00:00:00Z' }))).toBe(false)
      expect(ok(validPayload({ iat: '2028-01-01T00:00:00Z' }))).toBe(false)
    })
  })
})

describe('FooterSchema / RevocationPayloadSchema / toClaimTime', () => {
  it('footer is exactly {kid}', () => {
    expect(FooterSchema.safeParse({ kid: 'k2026a' }).success).toBe(true)
    expect(FooterSchema.safeParse({ kid: 'k2026a', wpk: 'x' }).success).toBe(false)
    expect(FooterSchema.safeParse({ kid: 'K2026A' }).success).toBe(false)
  })
  it('revocation list: {ver:1, iat, revoked[]}, strict, well-formed license IDs, at most 256', () => {
    const list = { ver: 1, iat: '2026-10-09T00:00:00Z', revoked: ['lic_aaaaaa'] }
    expect(RevocationPayloadSchema.safeParse(list).success).toBe(true)
    const ids = (n: number) =>
      Array.from({ length: n }, (_, i) => `lic_${String(i).padStart(6, '0')}`)
    expect(RevocationPayloadSchema.safeParse({ ...list, revoked: ids(256) }).success).toBe(true)
    const tooMany = ids(257)
    for (const bad of [
      { ...list, next: 1 },
      { ...list, revoked: ['nope'] },
      { ...list, ver: 2 },
      { ...list, revoked: tooMany },
    ]) {
      expect(RevocationPayloadSchema.safeParse(bad).success).toBe(false)
    }
  })
  it('revocation list: duplicate IDs are dropped (P2)', () =>
    expect(
      RevocationPayloadSchema.parse({
        ver: 1,
        iat: '2026-10-09T00:00:00Z',
        revoked: ['lic_aaaaaa', 'lic_bbbbbb', 'lic_aaaaaa'],
      }).revoked,
    ).toEqual(['lic_aaaaaa', 'lic_bbbbbb']))
  it('toClaimTime truncates to whole seconds and refuses an invalid Date', () => {
    expect(toClaimTime(new Date('2026-10-06T17:00:00.999Z'))).toBe('2026-10-06T17:00:00Z')
    expect(() => toClaimTime(new Date('nope'))).toThrow(RangeError)
  })
})
