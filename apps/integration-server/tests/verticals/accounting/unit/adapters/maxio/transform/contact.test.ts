import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MaxioCustomer } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/contact'

function makeContact(overrides: Partial<MaxioCustomer> = {}): MaxioCustomer {
  return {
    id: 42,
    first_name: 'Jane',
    last_name: 'Smith',
    organization: 'Globex Corp',
    email: 'jane@globex.com',
    phone: '+1-555-0200',
    address: '100 Industrial Way',
    address_2: 'Suite 5',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    country: 'US',
    portal_customer_created_at: null,
    ...overrides,
  }
}

describe('transformContact (Maxio)', () => {
  it('maps id from customer id as string', () => {
    expect(transformContact(makeContact()).id).toBe('42')
  })

  it('maps name from organization when present', () => {
    expect(transformContact(makeContact()).name).toBe('Globex Corp')
  })

  it('maps name from first_name + last_name when organization is absent', () => {
    expect(transformContact(makeContact({ organization: '' })).name).toBe('Jane Smith')
  })

  it('maps email', () => {
    expect(transformContact(makeContact()).emails?.[0]?.email).toBe('jane@globex.com')
  })

  it('maps phone', () => {
    expect(transformContact(makeContact()).telephones?.[0]?.telephone).toBe('+1-555-0200')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('100 Industrial Way')
    expect(result.billingAddress?.address2).toBe('Suite 5')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.region).toBe('IL')
    expect(result.billingAddress?.postalCode).toBe('62701')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('sets isCustomer to true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
