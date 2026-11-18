import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { canonicalFooterBytes, canonicalPayloadBytes } from '../src/serialize'
import { validPayload } from './helpers'

const text = (b: Uint8Array) => new TextDecoder().decode(b)

describe('canonical serialization (the bytes that get signed)', () => {
  it('is JSON with keys sorted at every level', () =>
    expect(text(canonicalPayloadBytes(validPayload()))).toBe(
      '{"aud":"opensteward","env":"prod","exp":"2027-10-06T17:00:00Z","features":["mcp","vertical:accounting","vertical:crm","vertical:payments"],"iat":"2026-10-06T17:00:00Z","iss":"opensteward.dev","label":"production","limits":{"connections":5,"tenants":1},"nbf":"2026-10-06T17:00:00Z","org":"Acme Försäkring AB","sub":"lic_8f3k2abc","tier":"free","ver":1}',
    ))
  it('does not depend on input key order, including extra limit keys', () => {
    const p = validPayload({ limits: { tenants: 1, seats: 3, connections: 5 } })
    const reversed = Object.fromEntries(Object.entries(p).reverse()) as typeof p
    expect(canonicalPayloadBytes(reversed)).toEqual(canonicalPayloadBytes(p))
    expect(text(canonicalPayloadBytes(p))).toContain(
      '"limits":{"connections":5,"seats":3,"tenants":1}',
    )
  })
  it('signs features deduplicated, in first-seen order', () =>
    expect(
      text(
        canonicalPayloadBytes(validPayload({ features: ['vertical:crm', 'mcp', 'vertical:crm'] })),
      ),
    ).toContain('"features":["vertical:crm","mcp"]'))
  it('validates before serializing', () =>
    expect(() => canonicalPayloadBytes(validPayload({ tier: 'Gold' }))).toThrow(ZodError))
  it('uses the revocations schema for the revocations purpose, and refuses a mismatch', () => {
    const list = { ver: 1 as const, iat: '2026-10-09T00:00:00Z', revoked: ['lic_aaaaaa'] }
    expect(text(canonicalPayloadBytes(list, 'revocations'))).toBe(
      '{"iat":"2026-10-09T00:00:00Z","revoked":["lic_aaaaaa"],"ver":1}',
    )
    expect(() => canonicalPayloadBytes(list)).toThrow(ZodError)
    expect(() => canonicalPayloadBytes(validPayload(), 'revocations')).toThrow(ZodError)
  })
  it('footer serializes to {"kid":...} and validates', () => {
    expect(text(canonicalFooterBytes({ kid: 'k2026a' }))).toBe('{"kid":"k2026a"}')
    expect(() => canonicalFooterBytes({ kid: 'K2026A' })).toThrow(ZodError)
  })
})
