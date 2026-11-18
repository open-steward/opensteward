import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type CertiniaContact } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/contact'

function makeContact(overrides: Partial<CertiniaContact> = {}): CertiniaContact {
  return {
    Id: 'c0C000000001',
    Name: 'Certinia Services Ltd',
    Type: 'Customer',
    Email: 'billing@certinia.com',
    Phone: '+1-415-555-0100',
    BillingStreet: '1 Market Street',
    BillingCity: 'San Francisco',
    BillingState: 'CA',
    BillingPostalCode: '94105',
    BillingCountry: 'US',
    IsActive__c: true,
    ...overrides,
  }
}

describe('transformContact (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('c0C000000001')
    expect(result.name).toBe('Certinia Services Ltd')
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('maps Customer type to isCustomer=true, isSupplier=false', () => {
    const result = transformContact(makeContact({ Type: 'Customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps Vendor type to isSupplier=true, isCustomer=false', () => {
    const result = transformContact(makeContact({ Type: 'Vendor' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('billing@certinia.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+1-415-555-0100')
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('1 Market Street')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.region).toBe('CA')
    expect(result.billingAddress?.postalCode).toBe('94105')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('returns undefined emails when email is absent', () => {
    const result = transformContact(makeContact({ Email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
