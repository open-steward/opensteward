import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type BlacklineOrganization } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/organization'

function makeOrganization(overrides: Partial<BlacklineOrganization> = {}): BlacklineOrganization {
  return {
    companyId: 'comp-001',
    companyName: 'Acme Corp',
    legalName: 'Acme Corporation LLC',
    taxId: 'US123456789',
    email: 'finance@acme.com',
    phone: '+1-555-0200',
    address: '123 Main St',
    city: 'Chicago',
    postalCode: '60601',
    country: 'US',
    ...overrides,
  }
}

describe('transformOrganization (BlackLine)', () => {
  it('maps name and legalName', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('Acme Corp')
    expect(result.legalName).toBe('Acme Corporation LLC')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('US123456789')
  })

  it('does not map email (Organization schema has no emails field)', () => {
    const result = transformOrganization(makeOrganization())
    expect(result).not.toHaveProperty('emails')
  })

  it('maps address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('123 Main St')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.postalCode).toBe('60601')
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
