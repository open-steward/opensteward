import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  type RawLemlistCompany,
} from '../../../../../../../src/verticals/crm/adapters/lemlist/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawLemlistCompany> = {}): RawLemlistCompany {
  return { _id: 'co_1', ...overrides }
}

describe('lemlist transformCompany', () => {
  it('maps _id to string id', () => {
    expect(transformCompany(makeRaw({ _id: 'co_42' })).id).toBe('co_42')
  })

  it('maps fields.name to name', () => {
    expect(transformCompany(makeRaw({ fields: { name: 'Acme' } })).name).toBe('Acme')
  })

  it('falls back to domain as name when fields.name absent', () => {
    expect(transformCompany(makeRaw({ domain: 'acme.com', fields: {} })).name).toBe('acme.com')
  })

  it('maps domain', () => {
    expect(transformCompany(makeRaw({ domain: 'acme.com' })).domain).toBe('acme.com')
  })

  it('maps fields.industry to industry', () => {
    expect(transformCompany(makeRaw({ fields: { industry: 'Technology' } })).industry).toBe(
      'Technology',
    )
  })

  it('parses fields.size string to integer (takes first number)', () => {
    // size comes as a range like "51-200" — parseInt returns 51
    expect(transformCompany(makeRaw({ fields: { size: '51-200' } })).size).toBe(51)
  })

  it('returns undefined size for non-numeric string', () => {
    expect(transformCompany(makeRaw({ fields: { size: 'unknown' } })).size).toBeUndefined()
  })

  it('maps ownerId to owner_id', () => {
    expect(transformCompany(makeRaw({ ownerId: 'user_7' })).owner_id).toBe('user_7')
  })

  it('maps createdAt to created_at', () => {
    expect(transformCompany(makeRaw({ createdAt: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces a CompanySchema-valid result', () => {
    const raw = makeRaw({
      _id: 'co_1',
      domain: 'acme.com',
      ownerId: 'user_7',
      createdAt: '2026-01-01T00:00:00.000Z',
      fields: {
        name: 'Acme',
        industry: 'Technology',
        size: '51-200',
      },
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})
