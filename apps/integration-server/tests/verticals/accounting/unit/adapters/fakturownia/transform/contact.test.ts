import { describe, it, expect } from 'vitest'
import {
  transformClient,
  type FakturowniaClient,
} from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<FakturowniaClient> = {}): FakturowniaClient {
  return {
    id: 200,
    name: 'Acme sp. z o.o.',
    first_name: 'Jan',
    last_name: 'Kowalski',
    tax_no: 'PL1234567890',
    email: 'billing@acme.pl',
    phone: '+48-22-555-0001',
    mobile_phone: '+48-600-000-001',
    fax: '+48-22-555-0002',
    street: 'ul. Marszalkowska 1',
    city: 'Warsaw',
    post_code: '00-001',
    country: 'PL',
    company: true,
    kind: 'buyer',
    disable: false,
    currency: 'PLN',
    ...overrides,
  }
}

describe('fakturownia transformClient', () => {
  it('maps id to string', () => {
    const result = transformClient(makeRaw({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('kind=buyer → isCustomer=true, isSupplier=false', () => {
    const result = transformClient(makeRaw({ kind: 'buyer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('kind=seller → isCustomer=false, isSupplier=true', () => {
    const result = transformClient(makeRaw({ kind: 'seller' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('kind=both → isCustomer=true, isSupplier=true', () => {
    const result = transformClient(makeRaw({ kind: 'both' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('kind unset → defaults isCustomer=true', () => {
    const result = transformClient(makeRaw({ kind: undefined }))
    expect(result.isCustomer).toBe(true)
  })

  it('disable=true → isActive=false', () => {
    const result = transformClient(makeRaw({ disable: true }))
    expect(result.isActive).toBe(false)
  })

  it('disable=false → isActive=true', () => {
    const result = transformClient(makeRaw({ disable: false }))
    expect(result.isActive).toBe(true)
  })

  it('maps tax_no to taxNumber', () => {
    const result = transformClient(makeRaw({ tax_no: 'PL9876543210' }))
    expect(result.taxNumber).toBe('PL9876543210')
  })

  it('company=true → companyName set from name', () => {
    const result = transformClient(makeRaw({ company: true, name: 'Corp LLC' }))
    expect(result.companyName).toBe('Corp LLC')
  })

  it('maps mobile_phone as MOBILE telephone', () => {
    const result = transformClient(makeRaw({ mobile_phone: '+48-600-000-001' }))
    const mob = result.telephones?.find((t) => t.type === 'MOBILE')
    expect(mob?.telephone).toBe('+48-600-000-001')
  })

  it('maps fax as FAX telephone', () => {
    const result = transformClient(makeRaw({ fax: '+48-22-555-0002' }))
    const fax = result.telephones?.find((t) => t.type === 'FAX')
    expect(fax?.telephone).toBe('+48-22-555-0002')
  })

  it('maps street to billingAddress.address1', () => {
    const result = transformClient(makeRaw({ street: 'Nowy Swiat 10' }))
    expect(result.billingAddress?.address1).toBe('Nowy Swiat 10')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformClient(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformClient(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
