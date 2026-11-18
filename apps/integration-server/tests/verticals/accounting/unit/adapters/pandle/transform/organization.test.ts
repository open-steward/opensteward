import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type PandleOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/organization'

function makeOrganization(overrides: Partial<PandleOrganization> = {}): PandleOrganization {
  return {
    id: 1,
    name: 'Acme Ltd',
    legal_name: 'Acme Limited',
    company_number: '12345678',
    vat_number: 'GB123456789',
    currency: 'GBP',
    address_line_1: '10 Downing Street',
    address_line_2: 'Suite 5',
    city: 'London',
    region: 'Greater London',
    postcode: 'SW1A 2AA',
    country: 'GB',
    website: 'https://acme.co.uk',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id as string', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Ltd')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme Limited')
  })

  it('falls back to name when legal_name is empty', () => {
    expect(transformOrganization(makeOrganization({ legal_name: '' })).legalName).toBe('Acme Ltd')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('GB123456789')
  })

  it('falls back to company_number when vat_number is empty', () => {
    expect(transformOrganization(makeOrganization({ vat_number: '' })).taxNumber).toBe('12345678')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('GBP')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acme.co.uk')
  })

  it('returns undefined website when empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('10 Downing Street')
    expect(o.address?.address2).toBe('Suite 5')
    expect(o.address?.city).toBe('London')
    expect(o.address?.region).toBe('Greater London')
    expect(o.address?.postalCode).toBe('SW1A 2AA')
    expect(o.address?.country).toBe('GB')
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
