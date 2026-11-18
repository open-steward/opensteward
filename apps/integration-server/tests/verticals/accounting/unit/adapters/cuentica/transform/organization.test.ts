import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type CuenticaOrganization } from '../../../../../../../src/verticals/accounting/adapters/cuentica/transform/organization'

function makeOrganization(overrides: Partial<CuenticaOrganization> = {}): CuenticaOrganization {
  return {
    name: 'Digital Ventures S.L.',
    legal_name: 'Digital Ventures Sociedad Limitada',
    tax_id: 'B99887766',
    currency: 'EUR',
    website: 'https://digitalventures.es',
    address: 'Rambla de Cataluña 80',
    city: 'Barcelona',
    postal_code: '08008',
    country: 'ES',
    region: 'Catalunya',
    ...overrides,
  }
}

describe('transformOrganization (cuentica)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Digital Ventures S.L.')
    expect(result.legalName).toBe('Digital Ventures Sociedad Limitada')
    expect(result.taxNumber).toBe('B99887766')
    expect(result.currency).toBe('EUR')
    expect(result.website).toBe('https://digitalventures.es')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.city).toBe('Barcelona')
    expect(result.address?.country).toBe('ES')
    expect(result.address?.region).toBe('Catalunya')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
