import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type SnelStartOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/organization'

function makeOrganization(overrides: Partial<SnelStartOrganization> = {}): SnelStartOrganization {
  return {
    id: 'org-001',
    naam: 'Bakkerij de Groot',
    rechtsvorm: 'BV',
    kvkNummer: '12345678',
    btwNummer: 'NL123456789B01',
    valutacode: 'EUR',
    adres: {
      straat: 'Keizersgracht 100',
      postcode: '1015 AA',
      plaats: 'Amsterdam',
      land: 'NL',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps naam to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Bakkerij de Groot')
  })

  it('maps naam + rechtsvorm to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Bakkerij de Groot BV')
  })

  it('maps naam to legalName when rechtsvorm is empty', () => {
    expect(transformOrganization(makeOrganization({ rechtsvorm: '' })).legalName).toBe('Bakkerij de Groot')
  })

  it('maps btwNummer to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('NL123456789B01')
  })

  it('falls back to kvkNummer for taxNumber when btwNummer is empty', () => {
    expect(transformOrganization(makeOrganization({ btwNummer: '' })).taxNumber).toBe('12345678')
  })

  it('maps valutacode to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('maps adres fields to address', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Keizersgracht 100')
    expect(o.address?.city).toBe('Amsterdam')
    expect(o.address?.postalCode).toBe('1015 AA')
    expect(o.address?.country).toBe('NL')
  })

  it('returns undefined address fields when adres is null', () => {
    const o = transformOrganization(makeOrganization({ adres: null }))
    expect(o.address?.address1).toBeUndefined()
    expect(o.address?.city).toBeUndefined()
  })

  it('returns undefined name when naam is empty', () => {
    expect(transformOrganization(makeOrganization({ naam: '' })).name).toBeUndefined()
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
