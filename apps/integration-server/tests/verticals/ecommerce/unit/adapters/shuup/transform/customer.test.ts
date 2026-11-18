import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type ShuupContact,
} from '../../../../../../../src/verticals/ecommerce/adapters/shuup/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeContact(overrides: Partial<ShuupContact> = {}): ShuupContact {
  return {
    id: 789,
    name: 'Jane Smith',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane.smith@example.com',
    phone: '+1 555 123 4567',
    type: 'PersonContact',
    is_active: true,
    created_on: '2024-01-15T09:00:00Z',
    modified_on: '2024-06-10T14:30:00Z',
    default_billing_address: {
      street: '456 Oak Avenue',
      city: 'Chicago',
      region: 'IL',
      postal_code: '60601',
      country: 'US',
      phone: '+1 555 123 4567',
    },
    default_shipping_address: {
      street: '789 Pine Road',
      city: 'Chicago',
      region: 'IL',
      postal_code: '60602',
      country: 'US',
    },
    ...overrides,
  }
}

describe('transformCustomer (Shuup)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeContact())
    expect(result.id).toBe('789')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane.smith@example.com')
    expect(result.phone).toBe('+1 555 123 4567')
  })

  it('uses explicit first_name and last_name', () => {
    const result = transformCustomer(makeContact({ first_name: 'Jane', last_name: 'Smith' }))
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Smith')
  })

  it('splits name field when first_name and last_name are absent', () => {
    const result = transformCustomer(
      makeContact({ first_name: null, last_name: null, name: 'John Doe' }),
    )
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Doe')
  })

  it('handles single-word name', () => {
    const result = transformCustomer(
      makeContact({ first_name: null, last_name: null, name: 'Zara' }),
    )
    expect(result.firstName).toBe('Zara')
    expect(result.lastName).toBeUndefined()
  })

  it('handles multi-word last name', () => {
    const result = transformCustomer(
      makeContact({ first_name: null, last_name: null, name: 'Mary Anne Smith-Jones' }),
    )
    expect(result.firstName).toBe('Mary')
    expect(result.lastName).toBe('Anne Smith-Jones')
  })

  it('sets firstName/lastName to undefined when both name fields absent', () => {
    const result = transformCustomer(
      makeContact({ first_name: null, last_name: null, name: null }),
    )
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('maps billing address as defaultAddress', () => {
    const result = transformCustomer(makeContact())
    expect(result.defaultAddress).toMatchObject({
      line1: '456 Oak Avenue',
      city: 'Chicago',
      region: 'IL',
      postalCode: '60601',
      country: 'US',
    })
  })

  it('includes both billing and shipping in addresses array', () => {
    const result = transformCustomer(makeContact())
    expect(result.addresses).toHaveLength(2)
  })

  it('handles missing billing address gracefully', () => {
    const result = transformCustomer(makeContact({ default_billing_address: null }))
    expect(result.defaultAddress).toBeDefined() // falls back to shipping
    expect(result.addresses).toHaveLength(1)
  })

  it('handles missing both addresses gracefully', () => {
    const result = transformCustomer(
      makeContact({ default_billing_address: null, default_shipping_address: null }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeContact())
    expect(result.createdAt).toBe('2024-01-15T09:00:00Z')
    expect(result.updatedAt).toBe('2024-06-10T14:30:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeContact()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeContact())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles company contact with name only', () => {
    const result = transformCustomer(
      makeContact({
        type: 'CompanyContact',
        first_name: null,
        last_name: null,
        name: 'Acme Corp',
      }),
    )
    expect(result.firstName).toBe('Acme')
    expect(result.lastName).toBe('Corp')
  })
})
