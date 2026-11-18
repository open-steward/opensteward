import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawQuickbutikCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/quickbutik/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawQuickbutikCustomer> = {}): RawQuickbutikCustomer {
  return {
    email: 'test@example.com',
    phone_number: '+46700123456',
    shipping_details: {
      firstname: 'Jane',
      lastname: 'Doe',
      address: '1 Main St',
      city: 'Stockholm',
      zipcode: '11122',
      country: 'SE',
    },
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('uses derivedId as the canonical id', () => {
    const result = transformCustomer(makeCustomer(), 'derived-abc-123')
    expect(result.id).toBe('derived-abc-123')
  })

  it('maps email field', () => {
    const result = transformCustomer(makeCustomer({ email: 'hello@world.com' }), 'x')
    expect(result.email).toBe('hello@world.com')
  })

  it('maps phone_number to phone', () => {
    const result = transformCustomer(makeCustomer({ phone_number: '+46700999888' }), 'x')
    expect(result.phone).toBe('+46700999888')
  })

  it('maps shipping_details.firstname/lastname to firstName/lastName', () => {
    const result = transformCustomer(
      makeCustomer({
        shipping_details: { firstname: 'Alice', lastname: 'Smith' },
      }),
      'x',
    )
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Smith')
  })

  it('maps shipping_details address fields into defaultAddress', () => {
    const result = transformCustomer(makeCustomer(), 'x')
    expect(result.defaultAddress?.line1).toBe('1 Main St')
    expect(result.defaultAddress?.city).toBe('Stockholm')
    expect(result.defaultAddress?.postalCode).toBe('11122')
    expect(result.defaultAddress?.country).toBe('SE')
  })

  it('sets addresses array when address is present', () => {
    const result = transformCustomer(makeCustomer(), 'x')
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses?.[0]).toEqual(result.defaultAddress)
  })

  it('omits defaultAddress and addresses when shipping_details is empty/absent', () => {
    const result = transformCustomer(makeCustomer({ shipping_details: null }), 'x')
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('maps newsletter_subscribe to acceptsMarketing', () => {
    const result = transformCustomer(makeCustomer({ newsletter_subscribe: true }), 'x')
    expect(result.acceptsMarketing).toBe(true)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer(), 'cust-1')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
