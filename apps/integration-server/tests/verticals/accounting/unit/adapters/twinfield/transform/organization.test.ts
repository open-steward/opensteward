import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type TwinfieldOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/organization'

function makeOrganization(
  overrides: Partial<TwinfieldOrganization> = {},
): TwinfieldOrganization {
  return {
    code: 'NL001',
    name: 'Acme Holding BV',
    shortName: 'Acme Holding',
    vatNumber: 'NL123456789B01',
    cocNumber: '12345678',
    currency: 'EUR',
    addressLine1: 'Herengracht 100',
    city: 'Amsterdam',
    postcode: '1015 AA',
    country: 'NL',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps code to id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('NL001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Holding BV')
  })

  it('maps shortName to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme Holding')
  })

  it('falls back to name for legalName when shortName is empty', () => {
    expect(transformOrganization(makeOrganization({ shortName: '' })).legalName).toBe(
      'Acme Holding BV',
    )
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('NL123456789B01')
  })

  it('maps cocNumber to organizationCode', () => {
    expect(transformOrganization(makeOrganization()).organizationCode).toBe('12345678')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('maps address fields', () => {
    const org = transformOrganization(makeOrganization())
    expect(org.address?.address1).toBe('Herengracht 100')
    expect(org.address?.city).toBe('Amsterdam')
    expect(org.address?.postalCode).toBe('1015 AA')
    expect(org.address?.country).toBe('NL')
  })

  it('returns undefined taxNumber when vatNumber is empty', () => {
    expect(
      transformOrganization(makeOrganization({ vatNumber: '' })).taxNumber,
    ).toBeUndefined()
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
