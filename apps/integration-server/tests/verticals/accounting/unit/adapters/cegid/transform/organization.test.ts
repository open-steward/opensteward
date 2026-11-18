import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type CegidOrganization } from '../../../../../../../src/verticals/accounting/adapters/cegid/transform/organization'

function makeOrganization(overrides: Partial<CegidOrganization> = {}): CegidOrganization {
  return {
    id: '1',
    name: 'Société Bernard',
    legalName: 'Société Bernard SA',
    registrationNumber: '12345678900012',
    vatNumber: 'FR12345678900',
    addressLine1: '12 Rue de Bercy',
    postalCode: '75012',
    city: 'Paris',
    country: 'FR',
    email: 'info@bernard.fr',
    phone: '0123456789',
    website: 'https://bernard.fr',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Société Bernard')
    expect(result.legalName).toBe('Société Bernard SA')
    expect(result.taxNumber).toBe('12345678900012')
    expect(result.currency).toBe('EUR')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('12 Rue de Bercy')
    expect(result.address?.city).toBe('Paris')
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
