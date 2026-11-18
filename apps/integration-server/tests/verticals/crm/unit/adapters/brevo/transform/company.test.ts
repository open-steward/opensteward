import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawBrevoCompany } from '../../../../../../../src/verticals/crm/adapters/brevo/transform/company'

// Fixture shaped from the vendor spec's Company schema: name and domain live
// under `attributes` (there is no top-level `name`).
function makeRaw(overrides: Partial<RawBrevoCompany> = {}): RawBrevoCompany {
  return {
    id: '61f4b45d90124f66d70c33d0',
    attributes: {
      name: 'Acme Industries',
      domain: 'acme.example',
      phone_number: '+14155550123',
      industry: 'Manufacturing',
    },
    linkedContactsIds: [12, 32],
    createdAt: '2026-01-15T09:30:00.000+01:00',
    updatedAt: '2026-02-01T14:20:00.000+01:00',
    ...overrides,
  }
}

describe('brevo transformCompany', () => {
  it('maps id', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('61f4b45d90124f66d70c33d0')
  })

  it('maps name from attributes.name', () => {
    const result = transformCompany(makeRaw())
    expect(result.name).toBe('Acme Industries')
  })

  it('does not read a top-level `name` — the spec has none', () => {
    const result = transformCompany({ id: '1', name: 'wrong' } as unknown as RawBrevoCompany)
    expect(result.name).toBe('')
  })

  it('maps phone from attributes.phone_number', () => {
    const result = transformCompany(makeRaw({ attributes: { phone_number: '555-1234' } }))
    expect(result.phone).toBe('555-1234')
  })

  it('maps domain from attributes.domain, not attributes.website', () => {
    const result = transformCompany(makeRaw())
    expect(result.domain).toBe('acme.example')
    const stale = transformCompany(makeRaw({ attributes: { website: 'stale.example' } } as unknown as Partial<RawBrevoCompany>))
    expect(stale.domain).toBeUndefined()
  })

  it('maps industry from attributes.industry', () => {
    const result = transformCompany(makeRaw({ attributes: { industry: 'Tech' } }))
    expect(result.industry).toBe('Tech')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany({ id: '1' })).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransforms name and domain into attributes', () => {
    const result = untransformCompany({ name: 'Test Corp', domain: 'test.example', phone: '555-0000' })
    expect(result.attributes).toMatchObject({
      name: 'Test Corp',
      domain: 'test.example',
      phone_number: '555-0000',
    })
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
