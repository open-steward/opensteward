import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FoundationContact } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/contact'

function makeContact(overrides: Partial<FoundationContact> = {}): FoundationContact {
  return {
    VendorId: 'VEND-1',
    Name: 'Acme Construction',
    ContactType: 'Vendor',
    Email: 'contact@acme.com',
    Phone: '555-0100',
    Address1: '123 Main St',
    Address2: '',
    City: 'Austin',
    State: 'TX',
    ZipCode: '78701',
    Country: 'US',
    IsActive: true,
    ...overrides,
  }
}

describe('transformContact (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('VEND-1')
    expect(result.name).toBe('Acme Construction')
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('maps Vendor contact type to isSupplier=true, isCustomer=false', () => {
    const result = transformContact(makeContact({ ContactType: 'Vendor' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps Subcontractor contact type to isSupplier=true, isCustomer=false', () => {
    const result = transformContact(makeContact({ ContactType: 'Subcontractor' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps Owner contact type to isCustomer=true, isSupplier=false', () => {
    const result = transformContact(makeContact({ ContactType: 'Owner' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('contact@acme.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('555-0100')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Austin')
    expect(result.billingAddress?.region).toBe('TX')
    expect(result.billingAddress?.postalCode).toBe('78701')
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
