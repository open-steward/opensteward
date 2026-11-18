import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type CmicOrganization } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/organization'

function makeOrganization(overrides: Partial<CmicOrganization> = {}): CmicOrganization {
  return {
    CompanyId: 'COMP-001',
    CompanyName: 'BuildCo Construction',
    LegalName: 'BuildCo Construction Ltd.',
    TaxId: 'CA123456789',
    Email: 'info@buildco.ca',
    Phone: '+1-416-555-0100',
    Address: '789 Builder Blvd',
    City: 'Toronto',
    State: 'ON',
    PostalCode: 'M5H 2N2',
    Country: 'CA',
    ...overrides,
  }
}

describe('transformOrganization (CMiC)', () => {
  it('maps name and legalName', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('BuildCo Construction')
    expect(result.legalName).toBe('BuildCo Construction Ltd.')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('CA123456789')
  })

  it('does not map email (Organization schema has no emails field)', () => {
    const result = transformOrganization(makeOrganization())
    expect(result).not.toHaveProperty('emails')
  })

  it('maps address with region', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('789 Builder Blvd')
    expect(result.address?.city).toBe('Toronto')
    expect(result.address?.region).toBe('ON')
    expect(result.address?.postalCode).toBe('M5H 2N2')
    expect(result.address?.country).toBe('CA')
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
