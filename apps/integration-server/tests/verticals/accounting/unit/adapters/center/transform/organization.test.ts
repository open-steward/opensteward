import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type CenterOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/center/transform/organization'

function makeOrganization(overrides: Partial<CenterOrganization> = {}): CenterOrganization {
  return {
    id: 'org-001',
    name: 'Center Inc',
    legalName: 'Center Incorporated',
    taxNumber: '98-7654321',
    currency: 'USD',
    website: 'https://center.io',
    address: '100 Market St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'US',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Center Inc')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Center Incorporated')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('98-7654321')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://center.io')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('100 Market St')
    expect(o.address?.city).toBe('San Francisco')
    expect(o.address?.region).toBe('CA')
    expect(o.address?.postalCode).toBe('94105')
    expect(o.address?.country).toBe('US')
  })

  it('returns undefined website when website is empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when taxNumber is empty', () => {
    expect(transformOrganization(makeOrganization({ taxNumber: '' })).taxNumber).toBeUndefined()
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
