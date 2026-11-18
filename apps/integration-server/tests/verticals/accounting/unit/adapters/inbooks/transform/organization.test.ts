import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type InbooksOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/inbooks/transform/organization'

function makeOrg(overrides: Partial<InbooksOrganization> = {}): InbooksOrganization {
  return {
    id: 1,
    name: 'Inbooks Demo AB',
    org_number: '556222-3333',
    vat_number: 'SE556222333301',
    email: 'info@inbooks-demo.se',
    phone: '+46705556677',
    billing_address: 'Strandvägen 1',
    city: 'Stockholm',
    zip: '114 51',
    country: 'SE',
    currency: 'SEK',
    ...overrides,
  }
}

describe('transformOrganization (Inbooks)', () => {
  it('maps name and legalName', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Inbooks Demo AB')
    expect(result.legalName).toBe('Inbooks Demo AB')
  })

  it('maps org_number to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('556222-3333')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('SEK')
  })

  it('maps billing_address to address fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Strandvägen 1')
    expect(result.address?.city).toBe('Stockholm')
    expect(result.address?.postalCode).toBe('114 51')
    expect(result.address?.country).toBe('SE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrg()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
