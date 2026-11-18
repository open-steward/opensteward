import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AccountsIQContact } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/contact'

function makeContact(overrides: Partial<AccountsIQContact> = {}): AccountsIQContact {
  return {
    contactId: '101',
    entityId: '10',
    name: 'Global Corp Ltd',
    taxNumber: 'IE1234567T',
    registrationNumber: 'CRO123456',
    email: 'accounts@globalcorp.ie',
    phone: '+353 1 234 5678',
    addressLine1: '1 Grand Canal Dock',
    addressLine2: 'Dublin 2',
    city: 'Dublin',
    postCode: 'D02 XY45',
    country: 'IE',
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    ...overrides,
  }
}

describe('transformContact (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('101')
    expect(result.name).toBe('Global Corp Ltd')
    expect(result.identification).toBe('CRO123456')
    expect(result.taxNumber).toBe('IE1234567T')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('accounts@globalcorp.ie')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+353 1 234 5678')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('1 Grand Canal Dock')
    expect(result.billingAddress?.address2).toBe('Dublin 2')
    expect(result.billingAddress?.city).toBe('Dublin')
    expect(result.billingAddress?.postalCode).toBe('D02 XY45')
    expect(result.billingAddress?.country).toBe('IE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps isSupplier flag', () => {
    const result = transformContact(makeContact({ isCustomer: false, isSupplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
