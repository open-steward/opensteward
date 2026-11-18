import { describe, it, expect } from 'vitest'
import {
  transformClient,
  transformSupplier,
  type QuickFileClient,
  type QuickFileSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/quickfile/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeClient(overrides: Partial<QuickFileClient> = {}): QuickFileClient {
  return {
    ClientID: 42,
    CompanyName: 'Widget Co',
    FirstName: 'Jane',
    Surname: 'Smith',
    AccountReference: 'CUST-042',
    AddressLine1: '1 High Street',
    AddressLine2: 'Apt 2',
    Town: 'London',
    CountryISO: 'GB',
    Postcode: 'SW1A 1AA',
    VatNumber: 'GB123456789',
    DefaultCurrency: 'GBP',
    Email: 'jane@widget.co',
    Telephone: '+44 20 7946 0958',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<QuickFileSupplier> = {}): QuickFileSupplier {
  return {
    SupplierID: 77,
    CompanyName: 'Parts Ltd',
    FirstName: 'Bob',
    Surname: 'Jones',
    SupplierReference: 'SUPP-077',
    AddressLine1: '5 Factory Road',
    Town: 'Manchester',
    CountryISO: 'GB',
    Postcode: 'M1 1AA',
    VatNumber: 'GB987654321',
    Email: 'bob@parts.co.uk',
    Telephone: '+44 161 000 0001',
    ...overrides,
  }
}

describe('transformClient', () => {
  it('maps ClientID to id with cust_ prefix', () => {
    expect(transformClient(makeClient()).id).toBe('cust_42')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformClient(makeClient())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps VatNumber to taxNumber', () => {
    expect(transformClient(makeClient()).taxNumber).toBe('GB123456789')
  })

  it('maps AccountReference to identification', () => {
    expect(transformClient(makeClient()).identification).toBe('CUST-042')
  })

  it('maps DefaultCurrency to currency', () => {
    expect(transformClient(makeClient()).currency).toBe('GBP')
  })

  it('maps Email to emails array with WORK type', () => {
    const result = transformClient(makeClient())
    expect(result.emails?.[0].email).toBe('jane@widget.co')
    expect(result.emails?.[0].type).toBe('WORK')
  })

  it('maps Telephone to telephones array with WORK type', () => {
    const result = transformClient(makeClient())
    expect(result.telephones?.[0].telephone).toBe('+44 20 7946 0958')
    expect(result.telephones?.[0].type).toBe('WORK')
  })

  it('maps billing address fields', () => {
    const result = transformClient(makeClient())
    expect(result.billingAddress?.address1).toBe('1 High Street')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('passes raw object as metadata', () => {
    const raw = makeClient()
    expect(transformClient(raw).metadata).toBe(raw)
  })

  it('produces output that passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformClient(makeClient()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformClient({ ClientID: 1 })
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier', () => {
  it('maps SupplierID to id with supp_ prefix', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('supp_77')
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps SupplierReference to identification', () => {
    expect(transformSupplier(makeSupplier()).identification).toBe('SUPP-077')
  })

  it('maps VatNumber to taxNumber', () => {
    expect(transformSupplier(makeSupplier()).taxNumber).toBe('GB987654321')
  })

  it('maps CompanyName to companyName', () => {
    expect(transformSupplier(makeSupplier()).companyName).toBe('Parts Ltd')
  })

  it('produces output that passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeSupplier()))).not.toThrow()
  })
})
