import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type EpsilonNetCounterpart } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/contact'

function makeContact(overrides: Partial<EpsilonNetCounterpart> = {}): EpsilonNetCounterpart {
  return {
    id: '200',
    name: 'Acme Hellas ΑΕ',
    vatNumber: 'EL123456789',
    type: 'Customer',
    email: 'info@acme.gr',
    phone: '+302101234567',
    address: 'Ermou 10',
    city: 'Athens',
    postalCode: '10563',
    country: 'GR',
    ...overrides,
  }
}

describe('transformContact (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('200')
    expect(result.name).toBe('Acme Hellas ΑΕ')
    expect(result.identification).toBe('EL123456789')
    expect(result.taxNumber).toBe('EL123456789')
  })

  it('maps Customer type correctly', () => {
    const result = transformContact(makeContact({ type: 'Customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps Supplier type correctly', () => {
    const result = transformContact(makeContact({ type: 'Supplier' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.gr')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+302101234567')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Ermou 10')
    expect(result.billingAddress?.city).toBe('Athens')
    expect(result.billingAddress?.postalCode).toBe('10563')
    expect(result.billingAddress?.country).toBe('GR')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits emails when email is absent', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
