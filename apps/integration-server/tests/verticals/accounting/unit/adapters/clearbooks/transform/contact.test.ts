import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ClearBooksContact } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/contact'

function makeContact(overrides: Partial<ClearBooksContact> = {}): ClearBooksContact {
  return {
    entity_id: '42',
    company_name: 'Acme Ltd',
    email: 'accounts@acme.co.uk',
    phone: '020 7946 0000',
    address_1: '123 High Street',
    address_2: '',
    town: 'London',
    county: 'Greater London',
    postcode: 'EC1A 1BB',
    country: 'GB',
    is_customer: true,
    is_supplier: false,
    vat_number: 'GB123456789',
    company_number: '01234567',
    ...overrides,
  }
}

describe('transformContact (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('42')
    expect(result.name).toBe('Acme Ltd')
    expect(result.taxNumber).toBe('GB123456789')
    expect(result.identification).toBe('01234567')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('accounts@acme.co.uk')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('020 7946 0000')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('123 High Street')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.billingAddress?.region).toBe('Greater London')
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformContact(makeContact({ phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('handles supplier contact', () => {
    const result = transformContact(makeContact({ is_customer: false, is_supplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('converts numeric entity_id to string', () => {
    const result = transformContact(makeContact({ entity_id: 99 }))
    expect(result.id).toBe('99')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
