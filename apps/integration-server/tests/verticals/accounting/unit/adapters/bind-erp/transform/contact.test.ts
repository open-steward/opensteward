import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformClientListItem,
  transformClientDetails,
  transformProviderListItem,
  type BindClientListItem,
  type BindClientDetails,
  type BindProviderListItem,
} from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/contact'

function makeClientListItem(overrides: Partial<BindClientListItem> = {}): BindClientListItem {
  return {
    ID: 'client-1',
    Number: 42,
    ClientName: 'Acme Corp',
    LegalName: 'Acme Corporation SA',
    RFC: 'ACM010101ABC',
    Email: 'contact@acme.com',
    Phone: '+52-555-1234',
    City: 'Mexico City',
    ...overrides,
  }
}

function makeClientDetails(overrides: Partial<BindClientDetails> = {}): BindClientDetails {
  return {
    ID: 'client-2',
    Number: 99,
    RFC: 'CLI010101XYZ',
    LegalName: 'Client Legal SA',
    CommercialName: 'Client Commercial',
    CreditDays: 30,
    CreditAmount: 50000,
    PaymentMethod: 'transfer',
    CreationDate: '2023-01-15T00:00:00',
    Status: 'Active',
    Email: 'hello@client.com',
    Telephones: '+52-555-9876',
    ...overrides,
  }
}

function makeProviderListItem(overrides: Partial<BindProviderListItem> = {}): BindProviderListItem {
  return {
    ID: 'prov-1',
    Number: 10,
    ProviderName: 'Best Supplier',
    LegalName: 'Best Supplier SA',
    RFC: 'BSP010101ZZZ',
    Email: 'sales@bestsupplier.com',
    Phone: '+52-555-5678',
    City: 'Guadalajara',
    ...overrides,
  }
}

describe('transformClientListItem', () => {
  it('prefers ID over Number for id', () => {
    expect(transformClientListItem(makeClientListItem()).id).toBe('client-1')
  })

  it('falls back to Number string when ID is absent', () => {
    expect(transformClientListItem(makeClientListItem({ ID: undefined })).id).toBe('42')
  })

  it('prefers ClientName over LegalName for name', () => {
    expect(transformClientListItem(makeClientListItem()).name).toBe('Acme Corp')
  })

  it('falls back to LegalName when ClientName is absent', () => {
    expect(transformClientListItem(makeClientListItem({ ClientName: undefined })).name).toBe(
      'Acme Corporation SA',
    )
  })

  it('maps LegalName to companyName', () => {
    expect(transformClientListItem(makeClientListItem()).companyName).toBe('Acme Corporation SA')
  })

  it('maps RFC to taxNumber and identification', () => {
    const c = transformClientListItem(makeClientListItem())
    expect(c.taxNumber).toBe('ACM010101ABC')
    expect(c.identification).toBe('ACM010101ABC')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const c = transformClientListItem(makeClientListItem())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('isActive is always true', () => {
    expect(transformClientListItem(makeClientListItem()).isActive).toBe(true)
  })

  it('maps Email to emails array', () => {
    const c = transformClientListItem(makeClientListItem())
    expect(c.emails).toBeDefined()
    expect(c.emails![0].email).toBe('contact@acme.com')
  })

  it('maps Phone to telephones array with WORK type', () => {
    const c = transformClientListItem(makeClientListItem())
    expect(c.telephones).toBeDefined()
    expect(c.telephones![0].telephone).toBe('+52-555-1234')
    expect(c.telephones![0].type).toBe('WORK')
  })

  it('maps City to billingAddress', () => {
    const c = transformClientListItem(makeClientListItem())
    expect(c.billingAddress?.city).toBe('Mexico City')
  })

  it('passes raw object as metadata', () => {
    const raw = makeClientListItem()
    expect(transformClientListItem(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformClientListItem(makeClientListItem())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformClientDetails', () => {
  it('prefers CommercialName over LegalName for name', () => {
    expect(transformClientDetails(makeClientDetails()).name).toBe('Client Commercial')
  })

  it('falls back to LegalName when CommercialName is absent', () => {
    expect(transformClientDetails(makeClientDetails({ CommercialName: undefined })).name).toBe(
      'Client Legal SA',
    )
  })

  it('isActive is true for Status=Active', () => {
    expect(transformClientDetails(makeClientDetails({ Status: 'Active' })).isActive).toBe(true)
  })

  it('isActive is false for Status=Inactive (exact case)', () => {
    expect(transformClientDetails(makeClientDetails({ Status: 'Inactive' })).isActive).toBe(false)
  })

  it('isActive is false for Status=inactive (lowercase)', () => {
    expect(transformClientDetails(makeClientDetails({ Status: 'inactive' })).isActive).toBe(false)
  })

  it('isActive defaults to true when Status is absent', () => {
    expect(transformClientDetails(makeClientDetails({ Status: undefined })).isActive).toBe(true)
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const c = transformClientDetails(makeClientDetails())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('maps Telephones field to telephones array', () => {
    const c = transformClientDetails(makeClientDetails())
    expect(c.telephones![0].telephone).toBe('+52-555-9876')
  })

  it('maps CreationDate to createdAt', () => {
    const c = transformClientDetails(makeClientDetails())
    expect(c.createdAt).toEqual(new Date('2023-01-15T00:00:00'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeClientDetails()
    expect(transformClientDetails(raw).metadata).toBe(raw)
  })
})

describe('transformProviderListItem', () => {
  it('prefers ID over Number for id', () => {
    expect(transformProviderListItem(makeProviderListItem()).id).toBe('prov-1')
  })

  it('falls back to Number string when ID is absent', () => {
    expect(transformProviderListItem(makeProviderListItem({ ID: undefined })).id).toBe('10')
  })

  it('prefers ProviderName over LegalName for name', () => {
    expect(transformProviderListItem(makeProviderListItem()).name).toBe('Best Supplier')
  })

  it('falls back to LegalName when ProviderName is absent', () => {
    expect(transformProviderListItem(makeProviderListItem({ ProviderName: undefined })).name).toBe(
      'Best Supplier SA',
    )
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const c = transformProviderListItem(makeProviderListItem())
    expect(c.isCustomer).toBe(false)
    expect(c.isSupplier).toBe(true)
  })

  it('isActive is always true', () => {
    expect(transformProviderListItem(makeProviderListItem()).isActive).toBe(true)
  })

  it('maps RFC to taxNumber', () => {
    expect(transformProviderListItem(makeProviderListItem()).taxNumber).toBe('BSP010101ZZZ')
  })

  it('maps City to billingAddress', () => {
    expect(transformProviderListItem(makeProviderListItem()).billingAddress?.city).toBe(
      'Guadalajara',
    )
  })

  it('maps Email and Phone to emails and telephones', () => {
    const c = transformProviderListItem(makeProviderListItem())
    expect(c.emails![0].email).toBe('sales@bestsupplier.com')
    expect(c.telephones![0].telephone).toBe('+52-555-5678')
  })

  it('passes raw object as metadata', () => {
    const raw = makeProviderListItem()
    expect(transformProviderListItem(raw).metadata).toBe(raw)
  })
})
