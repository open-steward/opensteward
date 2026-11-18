import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformCustomer,
  transformSupplier,
  type VismaCustomer,
  type VismaSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/visma/transform/contact'

function makeCustomer(overrides: Partial<VismaCustomer> = {}): VismaCustomer {
  return {
    Id: 'cust-uuid-1234',
    CustomerNumber: '1001',
    Name: 'Acme AB',
    CorporateIdentityNumber: '556677-8899',
    EmailAddress: 'info@acme.se',
    Telephone: '08-123456',
    MobilePhone: '070-1234567',
    ContactPersonName: 'John Doe',
    ContactPersonEmail: 'john@acme.se',
    ContactPersonPhone: '08-654321',
    ContactPersonMobile: '070-7654321',
    InvoiceAddress1: 'Storgatan 1',
    InvoiceAddress2: 'Box 100',
    InvoiceCity: 'Stockholm',
    InvoicePostalCode: '11122',
    InvoiceCountryCode: 'SE',
    DeliveryAddress1: 'Leveransgatan 2',
    DeliveryAddress2: '',
    DeliveryCity: 'Gothenburg',
    DeliveryPostalCode: '41101',
    DeliveryCountryCode: 'SE',
    CurrencyCode: 'SEK',
    IsActive: true,
    VatNumber: 'SE556677889901',
    ChangedUtc: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<VismaSupplier> = {}): VismaSupplier {
  return {
    Id: 'supp-uuid-5678',
    SupplierNumber: '2001',
    Name: 'Supplier Corp',
    CorporateIdentityNumber: '112233-4455',
    EmailAddress: 'billing@supplier.se',
    Telephone: '031-112233',
    MobilePhone: '',
    ContactPersonName: '',
    ContactPersonEmail: '',
    ContactPersonPhone: '',
    ContactPersonMobile: '',
    Address1: 'Fabriksgatan 5',
    Address2: '',
    City: 'Malmö',
    PostalCode: '21111',
    CountryCode: 'SE',
    CurrencyCode: 'EUR',
    IsActive: true,
    ModifiedUtc: '2024-02-10T08:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('prefixes id with cust_', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust_cust-uuid-1234')
  })

  it('maps name and identification', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.name).toBe('Acme AB')
    expect(result.identification).toBe('556677-8899')
    expect(result.taxNumber).toBe('SE556677889901')
  })

  it('sets isCustomer true and isSupplier false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email and telephones', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.se')
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0]).toEqual({ telephone: '08-123456', type: 'WORK' })
    expect(result.telephones![1]).toEqual({ telephone: '070-1234567', type: 'MOBILE' })
  })

  it('maps billing and shipping addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress).toEqual({
      address1: 'Storgatan 1',
      address2: 'Box 100',
      city: 'Stockholm',
      postalCode: '11122',
      country: 'SE',
    })
    expect(result.shippingAddress).toEqual({
      address1: 'Leveransgatan 2',
      address2: undefined,
      city: 'Gothenburg',
      postalCode: '41101',
      country: 'SE',
    })
  })

  it('passes raw object through as metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier', () => {
  it('prefixes id with supp_', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.id).toBe('supp_supp-uuid-5678')
  })

  it('sets isCustomer false and isSupplier true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps supplier address to billingAddress', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.billingAddress).toEqual({
      address1: 'Fabriksgatan 5',
      address2: undefined,
      city: 'Malmö',
      postalCode: '21111',
      country: 'SE',
    })
  })

  it('maps currency', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.currency).toBe('EUR')
  })

  it('passes raw object through as metadata', () => {
    const raw = makeSupplier()
    const result = transformSupplier(raw)
    expect(result.metadata).toBe(raw)
  })
})
