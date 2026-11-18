import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type WisoOrganization } from '../../../../../../../src/verticals/accounting/adapters/wisomeinbuero/transform/organization'

function makeOrg(overrides: Partial<WisoOrganization> = {}): WisoOrganization {
  return {
    id: 'org-1',
    companyName: 'Muster AG',
    legalName: 'Muster Aktiengesellschaft',
    taxNumber: 'DE123456789',
    email: 'info@muster.de',
    phone: '+49 30 0',
    street: 'Hauptstraße 1',
    city: 'Berlin',
    zipCode: '10115',
    country: 'DE',
    currencyCode: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization (WISO MeinBüro)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Muster AG')
    expect(result.legalName).toBe('Muster Aktiengesellschaft')
    expect(result.taxNumber).toBe('DE123456789')
    expect(result.currency).toBe('EUR')
  })

  it('maps address correctly', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Hauptstraße 1')
    expect(result.address?.city).toBe('Berlin')
    expect(result.address?.country).toBe('DE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
