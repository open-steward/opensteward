import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformCustomer,
  transformSupplier,
  type FortnoxCustomer,
  type FortnoxSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/contact'

function makeCustomer(overrides: Partial<FortnoxCustomer> = {}): FortnoxCustomer {
  return {
    CustomerNumber: '1',
    Name: 'Acme AB',
    OrganisationNumber: '556000-0000',
    Email: 'info@acme.se',
    Phone: '08-123456',
    Fax: '08-654321',
    Address1: 'Storgatan 1',
    Address2: '',
    City: 'Stockholm',
    ZipCode: '11122',
    CountryCode: 'SE',
    Currency: 'SEK',
    Active: true,
    DeliveryAddress1: 'Lagergatan 5',
    DeliveryAddress2: '',
    DeliveryCity: 'Göteborg',
    DeliveryZipCode: '41101',
    DeliveryCountryCode: 'SE',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<FortnoxSupplier> = {}): FortnoxSupplier {
  return {
    SupplierNumber: '10',
    Name: 'Supplier AB',
    OrganisationNumber: '556111-0000',
    VATNumber: 'SE556111000001',
    Email: 'supplier@example.se',
    Phone1: '08-999000',
    Phone2: '',
    Fax: '',
    Address1: 'Leverantörsgatan 2',
    Address2: '',
    City: 'Malmö',
    ZipCode: '21120',
    CountryCode: 'SE',
    Currency: 'SEK',
    Active: true,
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('prefixes id with cust_', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_1')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps email and phone', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.emails?.[0]).toEqual({ email: 'info@acme.se', type: 'WORK' })
    expect(c.telephones?.[0]).toEqual({ telephone: '08-123456', type: 'WORK' })
    expect(c.telephones?.[1]).toEqual({ telephone: '08-654321', type: 'FAX' })
  })

  it('maps billing address', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.billingAddress?.address1).toBe('Storgatan 1')
    expect(c.billingAddress?.city).toBe('Stockholm')
    expect(c.billingAddress?.postalCode).toBe('11122')
    expect(c.billingAddress?.country).toBe('SE')
  })

  it('maps shipping address', () => {
    const c = transformCustomer(makeCustomer())
    expect(c.shippingAddress?.address1).toBe('Lagergatan 5')
    expect(c.shippingAddress?.city).toBe('Göteborg')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier', () => {
  it('prefixes id with supp_', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('supp_10')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const s = transformSupplier(makeSupplier())
    expect(s.isSupplier).toBe(true)
    expect(s.isCustomer).toBe(false)
  })

  it('maps VATNumber to taxNumber', () => {
    const s = transformSupplier(makeSupplier())
    expect(s.taxNumber).toBe('SE556111000001')
  })

  it('passes raw object as metadata', () => {
    const raw = makeSupplier()
    expect(transformSupplier(raw).metadata).toBe(raw)
  })
})
