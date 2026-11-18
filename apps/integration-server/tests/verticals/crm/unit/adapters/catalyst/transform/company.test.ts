import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawCatalystAccount,
} from '../../../../../../../src/verticals/crm/adapters/catalyst/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

// Fixture is NOT from a documented example: the article documents paths only, and
// the account response schema is in the OpenAPI spec behind a login at
// https://app.catalyst.io/public-apis. Field names mirror transform/company.ts.
function makeRaw(overrides: Partial<RawCatalystAccount> = {}): RawCatalystAccount {
  return { id: 1, name: 'Acme Corp', ...overrides }
}

describe('catalyst transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps string id', () => {
    expect(transformCompany(makeRaw({ id: 'co_abc' })).id).toBe('co_abc')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'BigCo' })).name).toBe('BigCo')
  })

  it('maps domain field to domain', () => {
    const result = transformCompany(makeRaw({ domain: 'acme.com' }))
    expect(result.domain).toBe('acme.com')
  })

  // No candidate-key chains over undocumented fields: domain reads `domain` only.
  it('does not guess domain from an undocumented website field', () => {
    const result = transformCompany(makeRaw({ website: 'beta.io' }))
    expect(result.domain).toBeUndefined()
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw({ phone: '+14155550123' })).phone).toBe('+14155550123')
  })

  it('maps industry', () => {
    expect(transformCompany(makeRaw({ industry: 'SaaS' })).industry).toBe('SaaS')
  })

  it('maps employee_count to size as number', () => {
    expect(transformCompany(makeRaw({ employee_count: 250 })).size).toBe(250)
  })

  it('maps owner_id to string', () => {
    expect(transformCompany(makeRaw({ owner_id: 99 })).owner_id).toBe('99')
  })

  it('passes created_at and updated_at through directly', () => {
    const result = transformCompany(
      makeRaw({
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('produces output that passes CompanySchema.parse', () => {
    const raw = makeRaw({
      domain: 'acme.com',
      phone: '+14155550123',
      industry: 'Tech',
      employee_count: 100,
      owner_id: 5,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('catalyst untransformCompany', () => {
  it('maps name', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result.name).toBe('Acme')
  })

  it('maps domain', () => {
    const result = untransformCompany({ domain: 'acme.com' })
    expect(result.domain).toBe('acme.com')
  })

  it('maps size to employee_count', () => {
    const result = untransformCompany({ size: 200 })
    expect(result.employee_count).toBe(200)
  })

  it('maps owner_id', () => {
    const result = untransformCompany({ owner_id: 'usr_5' })
    expect(result.owner_id).toBe('usr_5')
  })

  it('omits undefined fields', () => {
    const result = untransformCompany({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
