import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AppFolioContact } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/contact'

function makeContact(overrides: Partial<AppFolioContact> = {}): AppFolioContact {
  return {
    id: '42',
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '555-123-4567',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    country: 'US',
    contact_type: 'tenant',
    property_id: 'prop_1',
    unit_id: 'unit_1',
    lease_id: 'lease_1',
    ...overrides,
  }
}

describe('transformContact (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('42')
    expect(result.name).toBe('John Doe')
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
    expect(result.emails![0].email).toBe('john.doe@example.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('555-123-4567')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Austin')
    expect(result.billingAddress?.region).toBe('TX')
    expect(result.billingAddress?.postalCode).toBe('78701')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('marks owner as customer', () => {
    const result = transformContact(makeContact({ contact_type: 'owner' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('marks vendor as supplier', () => {
    const result = transformContact(makeContact({ contact_type: 'vendor' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('returns undefined telephones when phone is empty', () => {
    const result = transformContact(makeContact({ phone: '' }))
    expect(result.telephones).toBeUndefined()
  })

  it('converts numeric id to string', () => {
    const result = transformContact(makeContact({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
