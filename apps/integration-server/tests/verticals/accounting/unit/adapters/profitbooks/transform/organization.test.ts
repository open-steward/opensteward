import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type ProfitBooksOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/profitbooks/transform/organization'

function makeOrganization(overrides: Partial<ProfitBooksOrganization> = {}): ProfitBooksOrganization {
  return {
    id: 'org-001',
    name: 'Acme Corp',
    legal_name: 'Acme Corporation Inc.',
    tax_number: 'US123456789',
    currency: 'USD',
    website: 'https://acme.com',
    address: '123 Main St',
    city: 'New York',
    state: 'NY',
    postal_code: '10001',
    country: 'US',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Corp')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme Corporation Inc.')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('US123456789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acme.com')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('123 Main St')
    expect(o.address?.city).toBe('New York')
    expect(o.address?.region).toBe('NY')
    expect(o.address?.postalCode).toBe('10001')
    expect(o.address?.country).toBe('US')
  })

  it('returns undefined website when website is empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when tax_number is empty', () => {
    expect(transformOrganization(makeOrganization({ tax_number: '' })).taxNumber).toBeUndefined()
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
