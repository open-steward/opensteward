import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type WfirmaCompany,
} from '../../../../../../../src/verticals/accounting/adapters/wfirma/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeCompany(overrides: Partial<WfirmaCompany> = {}): WfirmaCompany {
  return {
    id: 1,
    name: 'Firma Testowa Sp. z o.o.',
    nip: '5260308468',
    regon: '012345678',
    street: 'ul. Marszałkowska',
    building_number: '10',
    flat_number: '3',
    zip: '00-624',
    city: 'Warszawa',
    country: 'PL',
    email: 'biuro@firma.pl',
    phone: '+48221234567',
    url: 'https://firma.pl',
    currency: 'PLN',
    created: '2022-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeCompany())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Firma Testowa Sp. z o.o.')
    expect(result.legalName).toBe('Firma Testowa Sp. z o.o.')
    expect(result.taxNumber).toBe('5260308468')
    expect(result.currency).toBe('PLN')
    expect(result.website).toBe('https://firma.pl')
  })

  it('falls back to regon for taxNumber when nip absent', () => {
    const result = transformOrganization(makeCompany({ nip: undefined, regon: 'REG-999' }))
    expect(result.taxNumber).toBe('REG-999')
  })

  it('builds address1 from street + building_number + flat_number', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address!.address1).toBe('ul. Marszałkowska 10 3')
    expect(result.address!.city).toBe('Warszawa')
    expect(result.address!.postalCode).toBe('00-624')
    expect(result.address!.country).toBe('PL')
  })

  it('omits address when no address data', () => {
    const result = transformOrganization(
      makeCompany({
        street: undefined,
        building_number: undefined,
        flat_number: undefined,
        city: undefined,
        zip: undefined,
        country: undefined,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('parses dates as Date objects', () => {
    const result = transformOrganization(makeCompany())
    expect(result.createdAt).toEqual(new Date('2022-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeCompany()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
