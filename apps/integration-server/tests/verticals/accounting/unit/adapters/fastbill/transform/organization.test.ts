import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FastBillOrganization } from '../../../../../../../src/verticals/accounting/adapters/fastbill/transform/organization'

function makeOrganization(overrides: Partial<FastBillOrganization> = {}): FastBillOrganization {
  return {
    CLIENT_ID: 'org-1',
    ORGANIZATION: 'Muster AG',
    EMAIL: 'info@muster.de',
    PHONE: '+49 89 0',
    STREET: 'Hauptstraße 1',
    ZIPCODE: '10115',
    CITY: 'Berlin',
    COUNTRY_CODE: 'DE',
    CURRENCY_CODE: 'EUR',
    VAT_ID: 'DE000000000',
    ...overrides,
  }
}

describe('transformOrganization (FastBill)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Muster AG')
    expect(result.currency).toBe('EUR')
  })

  it('maps address fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Hauptstraße 1')
    expect(result.address?.postalCode).toBe('10115')
    expect(result.address?.city).toBe('Berlin')
    expect(result.address?.country).toBe('DE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
