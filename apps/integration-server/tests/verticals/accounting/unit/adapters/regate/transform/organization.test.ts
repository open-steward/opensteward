import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type RegateOrganization } from '../../../../../../../src/verticals/accounting/adapters/regate/transform/organization'

function makeOrganization(overrides: Partial<RegateOrganization> = {}): RegateOrganization {
  return {
    id: '1',
    name: 'Acme France',
    legal_name: 'Acme France SAS',
    siret: '12345678900012',
    vat_number: 'FR12345678900',
    address: '5 Rue du Commerce',
    postal_code: '75015',
    city: 'Paris',
    country: 'FR',
    email: 'contact@acme.fr',
    phone: '0123456789',
    website: 'https://acme.fr',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Acme France')
    expect(result.legalName).toBe('Acme France SAS')
    expect(result.taxNumber).toBe('12345678900012')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.city).toBe('Paris')
    expect(result.address?.country).toBe('FR')
  })

  it('metadata identity', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
