import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type EvolizOrganization } from '../../../../../../../src/verticals/accounting/adapters/evoliz/transform/organization'

function makeOrganization(overrides: Partial<EvolizOrganization> = {}): EvolizOrganization {
  return {
    id: '1',
    name: 'TechInnovation',
    legal_name: 'TechInnovation SAS',
    siret: '12345678900012',
    vat_number: 'FR12345678900',
    address: '18 Rue des Entrepreneurs',
    zip: '75015',
    city: 'Paris',
    country: 'FR',
    email: 'contact@techinnovation.fr',
    phone: '0123456789',
    website: 'https://techinnovation.fr',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('TechInnovation')
    expect(result.legalName).toBe('TechInnovation SAS')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.city).toBe('Paris')
    expect(result.address?.postalCode).toBe('75015')
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
