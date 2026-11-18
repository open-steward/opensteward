import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawNopCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawNopCustomer> = {}): RawNopCustomer {
  return {
    id: 777,
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Johnson',
    billing_address: {
      first_name: 'Alice',
      last_name: 'Johnson',
      address1: '123 Main St',
      address2: 'Apt 4',
      city: 'Springfield',
      state_province_name: 'IL',
      zip_postal_code: '62701',
      country: 'US',
      phone_number: '+1-555-0123',
    },
    shipping_address: {
      first_name: 'Alice',
      last_name: 'Johnson',
      address1: '456 Oak Ave',
      city: 'Springfield',
      state_province_name: 'IL',
      zip_postal_code: '62702',
      country: 'US',
    },
    created_on_utc: '2024-01-10T12:00:00Z',
    updated_on_utc: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (nopCommerce)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('777')
    expect(result.email).toBe('alice@example.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Johnson')
    expect(result.phone).toBe('+1-555-0123')
  })

  it('maps billing address as default', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toEqual({
      line1: '123 Main St',
      line2: 'Apt 4',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    })
  })

  it('includes both billing and shipping addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(2)
  })

  it('handles missing addresses', () => {
    const result = transformCustomer(
      makeCustomer({ billing_address: null, shipping_address: null }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('alice@example.com')
    expect(body['first_name']).toBe('Alice')
    expect(body['last_name']).toBe('Johnson')
    expect((body['billing_address'] as Record<string, unknown>)['address1']).toBe('123 Main St')
  })
})
