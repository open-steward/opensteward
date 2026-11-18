import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type AccountEdgeOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/organization'

function makeOrganization(overrides: Partial<AccountEdgeOrganization> = {}): AccountEdgeOrganization {
  return {
    id: 'org-001',
    name: 'Acme Corp',
    legal_name: 'Acme Corporation Inc.',
    tax_number: '12-3456789',
    currency: 'USD',
    website: 'https://acme.com',
    address: '123 Main St',
    city: 'Toronto',
    state: 'ON',
    zip: 'M5V 1A1',
    country: 'CA',
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
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('12-3456789')
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
    expect(o.address?.city).toBe('Toronto')
    expect(o.address?.region).toBe('ON')
    expect(o.address?.postalCode).toBe('M5V 1A1')
    expect(o.address?.country).toBe('CA')
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
