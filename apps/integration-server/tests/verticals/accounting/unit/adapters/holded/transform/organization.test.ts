import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type HoldedOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/holded/transform/organization'

function makeOrganization(overrides: Partial<HoldedOrganization> = {}): HoldedOrganization {
  return {
    id: 'org-001',
    name: 'Empresa SL',
    legalName: 'Empresa Sociedad Limitada',
    vatnumber: 'B12345678',
    currency: 'EUR',
    website: 'https://empresa.es',
    address: 'Calle Mayor 10',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    country: 'ES',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Empresa SL')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Empresa Sociedad Limitada')
  })

  it('maps vatnumber to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('B12345678')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://empresa.es')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Calle Mayor 10')
    expect(o.address?.city).toBe('Madrid')
    expect(o.address?.region).toBe('Madrid')
    expect(o.address?.postalCode).toBe('28001')
    expect(o.address?.country).toBe('ES')
  })

  it('returns undefined website when website is empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when vatnumber is empty', () => {
    expect(transformOrganization(makeOrganization({ vatnumber: '' })).taxNumber).toBeUndefined()
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
