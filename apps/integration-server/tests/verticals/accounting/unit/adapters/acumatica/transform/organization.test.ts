import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AcumaticaOrganization } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/organization'

function makeOrganization(overrides: Partial<AcumaticaOrganization> = {}): AcumaticaOrganization {
  return {
    CompanyID: 'ACME',
    CompanyName: 'Acme Inc',
    TaxRegistrationID: '12-3456789',
    Email: 'info@acme.com',
    Phone: '+1-555-1000',
    Address: {
      AddressLine1: '1 Acme Blvd',
      AddressLine2: '',
      City: 'Chicago',
      PostalCode: '60601',
      CountryID: 'US',
    },
    ...overrides,
  }
}

describe('transformOrganization (Acumatica)', () => {
  it('maps name and legalName from CompanyName', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Acme Inc')
    expect(result.legalName).toBe('Acme Inc')
  })

  it('maps taxNumber from TaxRegistrationID', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('12-3456789')
  })

  it('does not map email (Organization schema has no emails field)', () => {
    expect(transformOrganization(makeOrganization())).not.toHaveProperty('emails')
  })

  it('does not map phone (Organization schema has no telephones field)', () => {
    expect(transformOrganization(makeOrganization())).not.toHaveProperty('telephones')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('1 Acme Blvd')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.country).toBe('US')
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
