import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type ManagerBusinessDetails,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<ManagerBusinessDetails> = {}): ManagerBusinessDetails {
  return {
    key: 'org-key-1',
    businessName: 'Northwind Traders',
    name: 'Northwind Traders Ltd',
    taxNumber: 'TAX-NW-001',
    currency: 'USD',
    website: 'https://northwind.example',
    address: '1 Commerce St\nSuite 100\nNew York\n10001\nUS',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps key to id', () => {
    expect(transformOrganization(makeOrg()).id).toBe('org-key-1')
  })

  it('falls back to slug when key absent', () => {
    const result = transformOrganization(makeOrg({ key: undefined, slug: 'northwind' }))
    expect(result.id).toBe('northwind')
  })

  it('prefers businessName for both name and legalName', () => {
    const result = transformOrganization(makeOrg())
    expect(result.name).toBe('Northwind Traders')
    expect(result.legalName).toBe('Northwind Traders')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('TAX-NW-001')
  })

  it('maps currency and website', () => {
    const result = transformOrganization(makeOrg())
    expect(result.currency).toBe('USD')
    expect(result.website).toBe('https://northwind.example')
  })

  it('parses multiline address into address object', () => {
    const result = transformOrganization(makeOrg())
    expect(result.address?.address1).toBe('1 Commerce St')
    expect(result.address?.address2).toBe('Suite 100')
    expect(result.address?.city).toBe('New York')
    expect(result.address?.postalCode).toBe('10001')
    expect(result.address?.country).toBe('US')
  })

  it('passes schema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeOrg()))).not.toThrow()
  })
})
