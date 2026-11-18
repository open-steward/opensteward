import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BlContact } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/contact'

function makeContact(overrides: Partial<BlContact> = {}): BlContact {
  return {
    Id: 'cont-uuid-1234',
    Name: 'Acme AB',
    OrgNumber: '556677-8899',
    Email: 'info@acme.se',
    Phone: '08-123456',
    Address1: 'Storgatan 1',
    City: 'Stockholm',
    ZipCode: '11122',
    Country: 'SE',
    IsCustomer: true,
    IsSupplier: false,
    IsActive: true,
    Currency: 'SEK',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cont-uuid-1234')
  })

  it('maps name and identification', () => {
    const result = transformContact(makeContact())
    expect(result.name).toBe('Acme AB')
    expect(result.identification).toBe('556677-8899')
  })

  it('maps isCustomer and isSupplier', () => {
    const result = transformContact(makeContact())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps supplier contact correctly', () => {
    const result = transformContact(makeContact({ IsCustomer: false, IsSupplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps isActive', () => {
    const result = transformContact(makeContact({ IsActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('maps email via toWorkEmail', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0]).toEqual({ email: 'info@acme.se', type: 'WORK' })
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeContact({ Email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('maps phone via toPhone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0]).toEqual({ telephone: '08-123456', type: 'WORK' })
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformContact(makeContact({ Phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress).toEqual({
      address1: 'Storgatan 1',
      city: 'Stockholm',
      postalCode: '11122',
      country: 'SE',
    })
  })

  it('maps currency', () => {
    const result = transformContact(makeContact())
    expect(result.currency).toBe('SEK')
  })

  it('returns undefined for empty string fields', () => {
    const result = transformContact(makeContact({ Name: '', OrgNumber: '', Currency: '' }))
    expect(result.name).toBeUndefined()
    expect(result.identification).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
