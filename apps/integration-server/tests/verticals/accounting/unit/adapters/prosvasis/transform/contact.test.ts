import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ProsvasisContact } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/contact'

function makeContact(overrides: Partial<ProsvasisContact> = {}): ProsvasisContact {
  return {
    id: '200',
    Name: 'Hellas Corp',
    Type: 'Customer',
    Email: 'info@hellas.gr',
    Phone: '+302101234567',
    Address: 'Stadiou 5',
    City: 'Athens',
    PostalCode: '10562',
    Country: 'GR',
    TaxId: 'EL123456789',
    ...overrides,
  }
}

describe('transformContact (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('200')
    expect(result.name).toBe('Hellas Corp')
    expect(result.identification).toBe('EL123456789')
    expect(result.taxNumber).toBe('EL123456789')
  })

  it('maps Customer type correctly', () => {
    const result = transformContact(makeContact({ Type: 'Customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps Supplier type correctly', () => {
    const result = transformContact(makeContact({ Type: 'Supplier' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@hellas.gr')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+302101234567')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Stadiou 5')
    expect(result.billingAddress?.city).toBe('Athens')
    expect(result.billingAddress?.postalCode).toBe('10562')
    expect(result.billingAddress?.country).toBe('GR')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits emails when Email is absent', () => {
    const result = transformContact(makeContact({ Email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
