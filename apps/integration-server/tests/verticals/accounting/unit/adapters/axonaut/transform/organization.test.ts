import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AxonautOrganization } from '../../../../../../../src/verticals/accounting/adapters/axonaut/transform/organization'

function makeOrganization(overrides: Partial<AxonautOrganization> = {}): AxonautOrganization {
  return {
    id: '1',
    name: 'Acme France',
    legal_name: 'Acme France SAS',
    siret: '12345678900012',
    vat_number: 'FR12345678900',
    address: '1 Avenue des Champs-Élysées',
    zip_code: '75008',
    city: 'Paris',
    country: 'FR',
    email: 'contact@acme.fr',
    phone: '+33 1 23 45 67 89',
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
    expect(result.website).toBe('https://acme.fr')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('1 Avenue des Champs-Élysées')
    expect(result.address?.city).toBe('Paris')
    expect(result.address?.postalCode).toBe('75008')
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
