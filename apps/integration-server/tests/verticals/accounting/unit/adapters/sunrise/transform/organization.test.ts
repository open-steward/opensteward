import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type SunriseOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/sunrise/transform/organization'

function makeOrganization(overrides: Partial<SunriseOrganization> = {}): SunriseOrganization {
  return {
    id: 'org-001',
    name: 'Sunrise Inc',
    legal_name: 'Sunrise Incorporated',
    tax_number: 'US987654321',
    currency: 'USD',
    website: 'https://sunrise.com',
    address: '456 Oak Ave',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94102',
    country: 'US',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Sunrise Inc')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Sunrise Incorporated')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('US987654321')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://sunrise.com')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('456 Oak Ave')
    expect(o.address?.city).toBe('San Francisco')
    expect(o.address?.region).toBe('CA')
    expect(o.address?.postalCode).toBe('94102')
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
