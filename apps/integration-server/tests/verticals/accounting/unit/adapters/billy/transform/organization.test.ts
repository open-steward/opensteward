import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type BillyOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/organization'

function makeOrganization(overrides: Partial<BillyOrganization> = {}): BillyOrganization {
  return {
    id: 'org-001',
    name: 'Acme ApS',
    registrationNo: 'DK12345678',
    baseCurrencyId: 'DKK',
    street: 'Vestergade 10',
    cityText: 'Copenhagen',
    zipcodeText: '1456',
    countryId: 'DK',
    phone: '+45 12345678',
    url: 'https://acme.dk',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme ApS')
  })

  it('maps name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme ApS')
  })

  it('maps registrationNo to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('DK12345678')
  })

  it('maps baseCurrencyId to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('DKK')
  })

  it('maps url to website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acme.dk')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Vestergade 10')
    expect(o.address?.city).toBe('Copenhagen')
    expect(o.address?.postalCode).toBe('1456')
    expect(o.address?.country).toBe('DK')
  })

  it('returns undefined website when url is empty', () => {
    expect(transformOrganization(makeOrganization({ url: '' })).website).toBeUndefined()
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
