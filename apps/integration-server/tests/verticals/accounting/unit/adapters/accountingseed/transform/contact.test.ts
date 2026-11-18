import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type AccountingSeedContact,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/contact'

function makeContact(overrides: Partial<AccountingSeedContact> = {}): AccountingSeedContact {
  return {
    Id: '0035e000004GHI1',
    Name: 'John Smith',
    FirstName: 'John',
    LastName: 'Smith',
    AcctSeed__Company_Name__c: 'Acme Corp',
    AcctSeed__Tax_Id__c: 'US12-3456789',
    AcctSeed__Customer__c: true,
    AcctSeed__Vendor__c: false,
    AcctSeed__Active__c: true,
    Email: 'john@acme.com',
    Phone: '+1-555-0100',
    MobilePhone: '+1-555-0101',
    MailingStreet: '123 Main St',
    MailingCity: 'Springfield',
    MailingState: 'IL',
    MailingPostalCode: '62701',
    MailingCountry: 'US',
    OtherStreet: '456 Elm St',
    OtherCity: 'Chicago',
    OtherState: 'IL',
    OtherPostalCode: '60601',
    OtherCountry: 'US',
    CurrencyIsoCode: 'USD',
    CreatedDate: '2024-01-10T08:00:00.000Z',
    LastModifiedDate: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id from Id', () => {
    expect(transformContact(makeContact()).id).toBe('0035e000004GHI1')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('John Smith')
  })

  it('maps firstName and lastName', () => {
    const result = transformContact(makeContact())
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
  })

  it('maps companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Corp')
  })

  it('maps taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('US12-3456789')
  })

  it('maps isCustomer and isSupplier', () => {
    const result = transformContact(makeContact())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps isActive', () => {
    expect(transformContact(makeContact()).isActive).toBe(true)
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('john@acme.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps telephones', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].telephone).toBe('+1-555-0100')
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].telephone).toBe('+1-555-0101')
    expect(result.telephones![1].type).toBe('MOBILE')
  })

  it('maps billingAddress', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.region).toBe('IL')
    expect(result.billingAddress?.postalCode).toBe('62701')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps shippingAddress', () => {
    const result = transformContact(makeContact())
    expect(result.shippingAddress?.address1).toBe('456 Elm St')
    expect(result.shippingAddress?.city).toBe('Chicago')
  })

  it('returns undefined email when Email is empty', () => {
    expect(transformContact(makeContact({ Email: '' })).emails).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
