import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type LibeoOrganization } from '../../../../../../../src/verticals/accounting/adapters/libeo/transform/organization'

function makeOrganization(overrides: Partial<LibeoOrganization> = {}): LibeoOrganization {
  return {
    id: '1',
    name: 'Entreprise Martin',
    legal_name: 'Entreprise Martin SAS',
    registration_number: '12345678900012',
    vat_number: 'FR12345678900',
    address_line1: '2 Rue de Rivoli',
    postal_code: '75001',
    city: 'Paris',
    country: 'FR',
    email: 'info@martin.fr',
    phone: '0123456789',
    website: 'https://martin.fr',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Entreprise Martin')
    expect(result.legalName).toBe('Entreprise Martin SAS')
    expect(result.taxNumber).toBe('12345678900012')
    expect(result.currency).toBe('EUR')
    expect(result.website).toBe('https://martin.fr')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('2 Rue de Rivoli')
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
