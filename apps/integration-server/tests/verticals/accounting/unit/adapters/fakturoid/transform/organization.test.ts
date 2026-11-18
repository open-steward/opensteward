import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type FakturoidOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/organization'

function makeOrganization(overrides: Partial<FakturoidOrganization> = {}): FakturoidOrganization {
  return {
    id: 1,
    name: 'Firma s.r.o.',
    registration_no: '12345678',
    vat_no: 'CZ12345678',
    street: 'Narodni 10',
    city: 'Prague',
    zip: '11000',
    country: 'CZ',
    currency: 'CZK',
    phone: '+420 123456789',
    web: 'https://firma.cz',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id as string', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Firma s.r.o.')
  })

  it('maps name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Firma s.r.o.')
  })

  it('maps registration_no to organizationCode', () => {
    expect(transformOrganization(makeOrganization()).organizationCode).toBe('12345678')
  })

  it('maps vat_no to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('CZ12345678')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('CZK')
  })

  it('maps web to website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://firma.cz')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Narodni 10')
    expect(o.address?.city).toBe('Prague')
    expect(o.address?.postalCode).toBe('11000')
    expect(o.address?.country).toBe('CZ')
  })

  it('returns undefined website when web is empty', () => {
    expect(transformOrganization(makeOrganization({ web: '' })).website).toBeUndefined()
  })

  it('returns undefined name when empty', () => {
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
