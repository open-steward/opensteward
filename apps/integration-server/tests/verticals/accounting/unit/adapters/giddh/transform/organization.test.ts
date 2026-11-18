import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type GiddhCompany,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/organization'

function makeCompany(overrides: Partial<GiddhCompany> = {}): GiddhCompany {
  return {
    uniqueName: 'giddh-corp',
    name: 'Giddh Corp',
    businessType: 'Private Limited',
    address: '5 Finance Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    country: 'India',
    phoneNumber: '+91-9876543210',
    email: 'hello@giddh.com',
    website: 'https://giddh.com',
    baseCurrency: 'INR',
    gstDetails: [{ gstin: 'GST123456789' }],
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name to name and legalName', () => {
    const result = transformOrganization(makeCompany())
    expect(result.name).toBe('Giddh Corp')
    expect(result.legalName).toBe('Giddh Corp')
  })

  it('maps first gstin from gstDetails to taxNumber', () => {
    const result = transformOrganization(makeCompany())
    expect(result.taxNumber).toBe('GST123456789')
  })

  it('sets taxNumber to undefined when gstDetails is empty', () => {
    const result = transformOrganization(makeCompany({ gstDetails: [] }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('maps baseCurrency to currency', () => {
    const result = transformOrganization(makeCompany())
    expect(result.currency).toBe('INR')
  })

  it('maps website', () => {
    const result = transformOrganization(makeCompany())
    expect(result.website).toBe('https://giddh.com')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('5 Finance Street')
    expect(result.address?.city).toBe('Mumbai')
    expect(result.address?.region).toBe('Maharashtra')
    expect(result.address?.postalCode).toBe('400001')
    expect(result.address?.country).toBe('IN')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
