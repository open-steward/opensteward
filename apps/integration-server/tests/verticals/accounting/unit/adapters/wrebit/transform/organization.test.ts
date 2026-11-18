import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type WrebitOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/wrebit/transform/organization'

function makeOrg(overrides: Partial<WrebitOrganization> = {}): WrebitOrganization {
  return {
    id: 1,
    name: 'Wrebit Demo AB',
    org_number: '556444-5555',
    vat_number: 'SE556444555501',
    email: 'info@wrebit-demo.se',
    phone: '+46708889900',
    address: 'Drottninggatan 22',
    city: 'Malmö',
    zip: '211 41',
    country: 'SE',
    currency: 'SEK',
    ...overrides,
  }
}

describe('transformOrganization (Wrebit)', () => {
  it('maps name and legalName', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Wrebit Demo AB')
    expect(result.legalName).toBe('Wrebit Demo AB')
  })

  it('maps org_number to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('556444-5555')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('SEK')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Drottninggatan 22')
    expect(result.address?.city).toBe('Malmö')
    expect(result.address?.postalCode).toBe('211 41')
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
