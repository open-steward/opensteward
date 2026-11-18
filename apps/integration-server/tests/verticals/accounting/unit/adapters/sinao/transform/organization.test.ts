import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SinaoOrganization } from '../../../../../../../src/verticals/accounting/adapters/sinao/transform/organization'

function makeOrganization(overrides: Partial<SinaoOrganization> = {}): SinaoOrganization {
  return {
    id: '1',
    name: 'My Company',
    legal_name: 'My Company SAS',
    siret: '12345678900012',
    vat_number: 'FR12345678900',
    address: '1 Place Vendôme',
    zip_code: '75001',
    city: 'Paris',
    country: 'FR',
    email: 'contact@mycompany.fr',
    phone: '0123456789',
    website: 'https://mycompany.fr',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('My Company')
    expect(result.legalName).toBe('My Company SAS')
    expect(result.taxNumber).toBe('12345678900012')
    expect(result.currency).toBe('EUR')
    expect(result.website).toBe('https://mycompany.fr')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('1 Place Vendôme')
    expect(result.address?.city).toBe('Paris')
    expect(result.address?.postalCode).toBe('75001')
    expect(result.address?.country).toBe('FR')
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
