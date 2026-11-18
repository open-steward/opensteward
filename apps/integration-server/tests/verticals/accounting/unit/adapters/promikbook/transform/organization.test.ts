import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type PromikBookOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/promikbook/transform/organization'

function makeOrg(overrides: Partial<PromikBookOrganization> = {}): PromikBookOrganization {
  return {
    id: 1,
    name: 'PromikBook Demo AB',
    org_number: '556000-0002',
    vat_number: 'SE556000000201',
    email: 'info@demo.se',
    phone: '+46709876543',
    address: 'Kungsgatan 12',
    city: 'Stockholm',
    zip: '111 35',
    country: 'SE',
    currency: 'SEK',
    ...overrides,
  }
}

describe('transformOrganization (PromikBook)', () => {
  it('maps name and legalName', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('PromikBook Demo AB')
    expect(result.legalName).toBe('PromikBook Demo AB')
  })

  it('maps org_number to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('556000-0002')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('SEK')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('Kungsgatan 12')
    expect(result.address?.city).toBe('Stockholm')
    expect(result.address?.postalCode).toBe('111 35')
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
