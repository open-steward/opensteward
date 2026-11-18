import { describe, it, expect } from 'vitest'
import {
  transformContractor,
  untransformContractor,
  type WfirmaContractor,
} from '../../../../../../../src/verticals/accounting/adapters/wfirma/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContractor(overrides: Partial<WfirmaContractor> = {}): WfirmaContractor {
  return {
    id: 101,
    name: 'Testowa Firma Sp. z o.o.',
    nip: '5260308468',
    regon: '012345678',
    street: 'ul. Marszałkowska',
    building_number: '5',
    flat_number: '2A',
    zip: '00-624',
    city: 'Warszawa',
    country: 'PL',
    email: 'kontakt@testowa.pl',
    phone: '+48221234567',
    fax: '+48221234568',
    buyer: true,
    seller: false,
    created: '2024-01-10T00:00:00.000Z',
    modified: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformContractor', () => {
  it('maps core fields correctly', () => {
    const result = transformContractor(makeContractor())
    expect(result.id).toBe('101')
    expect(result.name).toBe('Testowa Firma Sp. z o.o.')
    expect(result.taxNumber).toBe('5260308468')
    expect(result.identification).toBe('012345678')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps buyer=false to isCustomer=false', () => {
    const result = transformContractor(makeContractor({ buyer: false, seller: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('builds address1 from street + building_number + flat_number', () => {
    const result = transformContractor(makeContractor())
    expect(result.billingAddress!.address1).toBe('ul. Marszałkowska 5 2A')
  })

  it('maps phone as WORK and fax as FAX telephone', () => {
    const result = transformContractor(makeContractor())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].type).toBe('FAX')
  })

  it('maps email to WORK type', () => {
    const result = transformContractor(makeContractor())
    expect(result.emails![0].email).toBe('kontakt@testowa.pl')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('parses dates as Date objects', () => {
    const result = transformContractor(makeContractor())
    expect(result.createdAt).toEqual(new Date('2024-01-10T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('defaults buyer to false when absent', () => {
    const result = transformContractor(makeContractor({ buyer: undefined }))
    expect(result.isCustomer).toBe(false)
  })

  it('passes raw as metadata', () => {
    const raw = makeContractor()
    const result = transformContractor(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformContractor(makeContractor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformContractor', () => {
    const canonical = transformContractor(
      makeContractor({ name: 'Test Co', nip: '1234567890', city: 'Kraków' }),
    )
    const body = untransformContractor(canonical)
    expect(body['name']).toBe('Test Co')
    expect(body['nip']).toBe('1234567890')
    expect(body['city']).toBe('Kraków')
  })
})
