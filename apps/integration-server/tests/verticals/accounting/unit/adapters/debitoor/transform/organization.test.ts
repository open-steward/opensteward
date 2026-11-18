import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type DebitoorOrganization } from '../../../../../../../src/verticals/accounting/adapters/debitoor/transform/organization'

function makeOrganization(overrides: Partial<DebitoorOrganization> = {}): DebitoorOrganization {
  return {
    companyName: 'CloudOps S.L.',
    legalName: 'CloudOps Sociedad Limitada',
    taxNumber: 'B12398765',
    currency: 'EUR',
    website: 'https://cloudops.es',
    address: 'Calle Fuencarral 90',
    city: 'Madrid',
    zipCode: '28004',
    countryCode: 'ES',
    ...overrides,
  }
}

describe('transformOrganization (debitoor)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('CloudOps S.L.')
    expect(result.legalName).toBe('CloudOps Sociedad Limitada')
    expect(result.taxNumber).toBe('B12398765')
    expect(result.currency).toBe('EUR')
    expect(result.website).toBe('https://cloudops.es')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.city).toBe('Madrid')
    expect(result.address?.country).toBe('ES')
    expect(result.address?.postalCode).toBe('28004')
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
