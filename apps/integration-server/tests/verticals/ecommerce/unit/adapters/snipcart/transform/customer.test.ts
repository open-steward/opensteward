import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawSnipcartCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/snipcart/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawSnipcartCustomer> = {}): RawSnipcartCustomer {
  return {
    id: 'guid-1234-5678',
    email: 'jane.doe@example.com',
    billingAddressName: 'Jane Doe',
    billingAddressAddress1: '10 Downing St',
    billingAddressAddress2: 'Flat 1',
    billingAddressCity: 'London',
    billingAddressCountry: 'GB',
    billingAddressProvince: 'England',
    billingAddressPostalCode: 'SW1A 2AA',
    billingAddressPhone: '+44 20 7925 0918',
    shippingAddressSameAsBilling: true,
    status: 'Confirmed',
    statistics: {
      ordersCount: 3,
      ordersAmount: 149.97,
    },
    ...overrides,
  }
}

describe('transformCustomer (Snipcart)', () => {
  it('maps id and email directly', () => {
    const result = transformCustomer(makeCustomer())
    // id is a GUID string, passed through as-is
    expect(result.id).toBe('guid-1234-5678')
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('splits billingAddressName into firstName/lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps phone from billingAddressPhone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+44 20 7925 0918')
  })

  it('converts ordersAmount (major) to minor-unit totalSpent', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
    // 149.97 USD × 100 → 14997 cents
    expect(result.totalSpent).toEqual({ amount: 14997, currency: 'USD' })
  })

  it('maps billing address to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('10 Downing St')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.defaultAddress?.postalCode).toBe('SW1A 2AA')
  })

  it('deduplicates addresses when shippingAddressSameAsBilling=true', () => {
    const result = transformCustomer(makeCustomer())
    // shippingAddressSameAsBilling=true → mapShippingAddress returns billing → 2 identical entries
    expect(result.addresses).toHaveLength(2)
  })

  it('maps separate shipping address when not same as billing', () => {
    const result = transformCustomer(
      makeCustomer({
        shippingAddressSameAsBilling: false,
        shippingAddressAddress1: '1 Infinite Loop',
        shippingAddressCity: 'Cupertino',
        shippingAddressCountry: 'US',
        shippingAddressPostalCode: '95014',
      }),
    )
    expect(result.addresses).toHaveLength(2)
    const shipping = result.addresses?.[1]
    expect(shipping?.line1).toBe('1 Infinite Loop')
    expect(shipping?.country).toBe('US')
  })

  it('omits shipping address when it has no meaningful data', () => {
    const result = transformCustomer(
      makeCustomer({
        shippingAddressSameAsBilling: false,
        shippingAddressAddress1: null,
        shippingAddressCity: null,
        shippingAddressCountry: null,
        shippingAddressPostalCode: null,
      }),
    )
    // Only billing address present
    expect(result.addresses).toHaveLength(1)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })
})
