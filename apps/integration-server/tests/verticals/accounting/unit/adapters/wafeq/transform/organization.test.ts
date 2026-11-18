import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type WafeqOrganization } from '../../../../../../../src/verticals/accounting/adapters/wafeq/transform/organization'

function makeRaw(overrides: Partial<WafeqOrganization> = {}): WafeqOrganization {
  return {
    id: 'org1',
    name: 'Acme LLC',
    email: 'contact@acme.ae',
    phone: '+97142345678',
    address: {
      street: '456 Business Ave',
      city: 'Abu Dhabi',
      postal_code: '12345',
      country: 'AE',
    },
    tax_number: 'TRN987654',
    currency: 'AED',
    fiscal_year_start: '01-01',
    ...overrides,
  }
}

describe('transformOrganization (wafeq)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('org1')
    expect(result.name).toBe('Acme LLC')
    expect(result.legalName).toBe('Acme LLC')
    expect(result.taxNumber).toBe('TRN987654')
    expect(result.currency).toBe('AED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address).toBeDefined()
    expect(result.address!.city).toBe('Abu Dhabi')
    expect(result.address!.country).toBe('AE')
  })

  it('sets legalName equal to name', () => {
    const result = transformOrganization(makeRaw({ name: 'Test Co' }))
    expect(result.name).toBe('Test Co')
    expect(result.legalName).toBe('Test Co')
  })

  it('handles missing id gracefully', () => {
    const result = transformOrganization(makeRaw({ id: undefined }))
    expect(result.id).toBeUndefined()
  })

  it('handles missing address gracefully', () => {
    const result = transformOrganization(makeRaw({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformOrganization({})
    expect(result.id).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
