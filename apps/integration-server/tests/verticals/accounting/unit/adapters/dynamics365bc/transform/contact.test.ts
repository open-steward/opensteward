import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BCCustomer } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/contact'

function makeCustomer(overrides: Partial<BCCustomer> = {}): BCCustomer {
  return {
    id: 'cust-1',
    number: 'C001',
    displayName: 'Acme Corp',
    type: 'Company',
    email: 'info@acme.com',
    phoneNumber: '+441234567890',
    taxRegistrationNumber: 'GB123',
    currencyCode: 'GBP',
    blocked: '',
    ...overrides,
  }
}

describe('transformContact (dynamics365bc)', () => {
  it('maps id and name', () => {
    const result = transformContact(makeCustomer())
    expect(result.id).toBe('cust-1')
    expect(result.name).toBe('Acme Corp')
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeCustomer({ email: 'test@example.com' }))
    expect(result.emails?.[0]?.email).toBe('test@example.com')
  })

  it('maps phoneNumber to telephones array', () => {
    const result = transformContact(makeCustomer({ phoneNumber: '+44000' }))
    expect(result.telephones?.[0]?.telephone).toBe('+44000')
  })

  it('sets isCustomer true', () => {
    const result = transformContact(makeCustomer())
    expect(result.isCustomer).toBe(true)
  })

  it('isActive true when blocked is empty string', () => {
    const result = transformContact(makeCustomer({ blocked: '' }))
    expect(result.isActive).toBe(true)
  })

  it('isActive false when blocked is set', () => {
    const result = transformContact(makeCustomer({ blocked: 'All' }))
    expect(result.isActive).toBe(false)
  })

  it('maps billing address', () => {
    const result = transformContact(makeCustomer({ addressLine1: '10 Baker St', city: 'London', country: 'GB' }))
    expect(result.billingAddress?.address1).toBe('10 Baker St')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomer()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
