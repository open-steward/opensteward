import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type ZipBooksOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/zipbooks/transform/organization'

function makeOrganization(overrides: Partial<ZipBooksOrganization> = {}): ZipBooksOrganization {
  return {
    id: 'org-001',
    name: 'ZipBooks Inc',
    legal_name: 'ZipBooks Incorporated',
    tax_id: '98-7654321',
    currency: 'USD',
    website: 'https://zipbooks.com',
    street: '123 Tech Blvd',
    city: 'Lehi',
    state: 'UT',
    zip: '84043',
    country: 'US',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('ZipBooks Inc')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('ZipBooks Incorporated')
  })

  it('maps tax_id to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('98-7654321')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://zipbooks.com')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('123 Tech Blvd')
    expect(o.address?.city).toBe('Lehi')
    expect(o.address?.region).toBe('UT')
    expect(o.address?.postalCode).toBe('84043')
    expect(o.address?.country).toBe('US')
  })

  it('returns undefined website when website is empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when tax_id is empty', () => {
    expect(transformOrganization(makeOrganization({ tax_id: '' })).taxNumber).toBeUndefined()
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
