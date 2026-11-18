import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MaxioOrganization } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/organization'

function makeOrganization(overrides: Partial<MaxioOrganization> = {}): MaxioOrganization {
  return {
    id: 1,
    name: 'My SaaS Company',
    subdomain: 'mysaas',
    currency: 'USD',
    address: '200 Business Rd',
    address_2: '',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    country: 'US',
    phone: '+1-512-0001',
    email: 'billing@mysaas.com',
    ...overrides,
  }
}

describe('transformOrganization (Maxio)', () => {
  it('maps name and legalName from name', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('My SaaS Company')
    expect(result.legalName).toBe('My SaaS Company')
  })

  it('does not map email (Organization schema has no emails field)', () => {
    expect(transformOrganization(makeOrganization())).not.toHaveProperty('emails')
  })

  it('does not map phone (Organization schema has no telephones field)', () => {
    expect(transformOrganization(makeOrganization())).not.toHaveProperty('telephones')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('200 Business Rd')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.postalCode).toBe('78701')
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
