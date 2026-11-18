import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawCrystallizeOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawCrystallizeOrder> = {}): RawCrystallizeOrder {
  return {
    id: 'order-001',
    referenceId: 'REF-1001',
    customer: {
      identifier: 'cust-001',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+44 20 7946 0958',
      addresses: [
        {
          type: 'delivery',
          streetNumber: '1',
          street: 'Programming Lane',
          city: 'London',
          state: 'Greater London',
          postalCode: 'NW1 2AB',
          country: 'GB',
        },
        {
          type: 'billing',
          street: '2 Invoice Road',
          city: 'London',
          postalCode: 'EC1A 1BB',
          country: 'GB',
        },
      ],
    },
    cart: [
      {
        name: 'Ceramic Coffee Mug',
        sku: 'MUG-WHT',
        quantity: 2,
        productId: 'prod-001',
        productVariantId: 'var-001',
        price: { gross: 24.99, net: 20.82, currency: 'USD' },
      },
    ],
    total: { gross: 49.98, net: 41.64, currency: 'USD' },
    payment: [{ provider: 'stripe', providerId: 'pi_123' }],
    additionalInformation: 'Gift wrap please',
    createdAt: '2024-05-01T10:00:00.000Z',
    updatedAt: '2024-05-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-001')
    expect(result.orderNumber).toBe('REF-1001')
    expect(result.customerId).toBe('cust-001')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 4998, currency: 'USD' })
  })

  it('maps financial status based on payment', () => {
    expect(transformOrder(makeOrder()).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ payment: [] })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ payment: null })).financialStatus).toBe('PENDING')
  })

  it('maps nested cart items to line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.title).toBe('Ceramic Coffee Mug')
    expect(li.sku).toBe('MUG-WHT')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2499, currency: 'USD' })
    expect(li.productId).toBe('prod-001')
    expect(li.variantId).toBe('var-001')
  })

  it('maps shipping and billing addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('1 Programming Lane')
    expect(result.shippingAddress?.country).toBe('GB')
    expect(result.billingAddress?.line1).toBe('2 Invoice Road')
    expect(result.billingAddress?.postalCode).toBe('EC1A 1BB')
  })

  it('maps additional information to note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Gift wrap please')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw['customer']).toBeDefined()
    expect(raw['cart']).toBeDefined()
  })

  it('handles missing customer', () => {
    const result = transformOrder(makeOrder({ customer: null }))
    expect(result.customerId).toBeUndefined()
    expect(result.email).toBeUndefined()
  })
})
