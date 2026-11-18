import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type TwentyFourSevenOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/organization'

function makeOrganization(overrides: Partial<TwentyFourSevenOrganization> = {}): TwentyFourSevenOrganization {
  return {
    id: 'org-001',
    name: 'Nordic Tech AS',
    legalName: 'Nordic Tech AS',
    organizationNumber: 'NO987654321',
    currency: 'NOK',
    street: 'Storgata 1',
    city: 'Oslo',
    postalCode: '0155',
    country: 'NO',
    website: 'https://nordictech.no',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Nordic Tech AS')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Nordic Tech AS')
  })

  it('maps organizationNumber to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('NO987654321')
  })

  it('maps organizationNumber to organizationCode', () => {
    expect(transformOrganization(makeOrganization()).organizationCode).toBe('NO987654321')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('NOK')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://nordictech.no')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Storgata 1')
    expect(o.address?.city).toBe('Oslo')
    expect(o.address?.postalCode).toBe('0155')
    expect(o.address?.country).toBe('NO')
  })

  it('returns undefined website when website is empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
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
