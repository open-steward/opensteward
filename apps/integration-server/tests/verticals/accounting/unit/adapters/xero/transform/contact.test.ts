import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type XeroContact } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/contact'

function makeContact(overrides: Partial<XeroContact> = {}): XeroContact {
  return {
    ContactID: 'xero-cnt-001',
    Name: 'Acme Ltd',
    FirstName: 'John',
    LastName: 'Smith',
    IsCustomer: true,
    IsSupplier: false,
    ContactStatus: 'ACTIVE',
    EmailAddress: 'john@acme.com',
    TaxNumber: 'GB123456789',
    DefaultCurrency: 'GBP',
    Phones: [],
    Addresses: [],
    ...overrides,
  }
}

describe('transformContact (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('xero-cnt-001')
    expect(result.name).toBe('Acme Ltd')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('GBP')
    expect(result.taxNumber).toBe('GB123456789')
  })

  it('maps email address', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('john@acme.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('returns no emails when EmailAddress is empty', () => {
    const result = transformContact(makeContact({ EmailAddress: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('maps ARCHIVED status to isActive=false', () => {
    const result = transformContact(makeContact({ ContactStatus: 'ARCHIVED' }))
    expect(result.isActive).toBe(false)
  })

  it('maps phone numbers', () => {
    const result = transformContact(
      makeContact({
        Phones: [
          { PhoneType: 'DEFAULT', PhoneNumber: '12345', PhoneAreaCode: '020', PhoneCountryCode: '+44' },
        ],
      }),
    )
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toContain('12345')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address from POBOX', () => {
    const result = transformContact(
      makeContact({
        Addresses: [
          {
            AddressType: 'POBOX',
            AddressLine1: '123 High St',
            AddressLine2: '',
            City: 'London',
            PostalCode: 'EC1A 1BB',
            Country: 'GB',
          },
        ],
      }),
    )
    expect(result.billingAddress?.address1).toBe('123 High St')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('passes raw object through as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
