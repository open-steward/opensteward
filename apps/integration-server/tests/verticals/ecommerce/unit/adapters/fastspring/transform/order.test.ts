/**
 * FastSpring Order transform tests.
 *
 * Raw shape per https://developer.fastspring.com/reference/retrieve-an-order
 * and https://developer.fastspring.com/reference/update-order-tags-and-attributes.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrderTags,
  type RawFastSpringOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/fastspring/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawFastSpringOrder> = {}): RawFastSpringOrder {
  return {
    order: 'abcDEFgHiJklM1N-3OP9q',
    reference: 'ABC1234567-8910-11121D',
    completed: true,
    changed: 1723838225894,
    live: false,
    currency: 'USD',
    account: 'abcDEFgHiJklM1N-3OP9q',
    total: 10,
    tax: 0,
    subtotal: 10,
    discount: 0,
    customer: { first: 'Jane', last: 'Doe', email: 'jane.doe@example.com', phone: '555-555-5555' },
    address: { city: 'Santa Barbara', regionDisplay: 'California', postalCode: '93101', country: 'US' },
    notes: ['This is my note.'],
    items: [
      {
        product: 'furious-falcon',
        quantity: 1,
        display: 'Furious Falcon',
        sku: null,
        subtotal: 10,
        discount: 0,
        isAddon: true,
      },
    ],
    ...overrides,
  }
}

describe('FastSpring transform/order', () => {
  it('maps a full order and survives OrderSchema.parse', () => {
    const order = transformOrder(makeOrder())
    expect(OrderSchema.parse(order)).toBeTruthy()
    expect(order.id).toBe('abcDEFgHiJklM1N-3OP9q')
    expect(order.email).toBe('jane.doe@example.com')
    expect(order.currency).toBe('USD')
    expect(order.financialStatus).toBe('PAID')
  })

  it('converts decimal totals to integer minor units', () => {
    const order = transformOrder(makeOrder({ total: 19.99, tax: 1.5, subtotal: 18.49 }))
    OrderSchema.parse(order)
    expect(order.totalPrice).toEqual({ amount: 1999, currency: 'USD' })
    expect(order.totalTax).toEqual({ amount: 150, currency: 'USD' })
    expect(order.subtotalPrice).toEqual({ amount: 1849, currency: 'USD' })
  })

  it('maps line items with a unit price derived from subtotal/quantity', () => {
    const order = transformOrder(
      makeOrder({ items: [{ product: 'furious-falcon', quantity: 2, subtotal: 20 }] }),
    )
    OrderSchema.parse(order)
    expect(order.lineItems).toHaveLength(1)
    expect(order.lineItems![0]!.quantity).toBe(2)
    expect(order.lineItems![0]!.price).toEqual({ amount: 1000, currency: 'USD' })
    expect(order.lineItems![0]!.productId).toBe('furious-falcon')
  })

  it('maps completed=false to PENDING', () => {
    const order = transformOrder(makeOrder({ completed: false }))
    expect(order.financialStatus).toBe('PENDING')
  })

  it('never sets fulfillmentStatus, cancelledAt, cancelReason, or createdAt (no such upstream concept)', () => {
    const order = transformOrder(makeOrder())
    OrderSchema.parse(order)
    expect(order.fulfillmentStatus).toBeUndefined()
    expect(order.cancelledAt).toBeUndefined()
    expect(order.cancelReason).toBeUndefined()
    expect(order.createdAt).toBeUndefined()
  })

  it('converts the `changed` epoch-ms timestamp to ISO 8601 for updatedAt', () => {
    const order = transformOrder(makeOrder({ changed: 1723838225894 }))
    OrderSchema.parse(order)
    expect(order.updatedAt).toBe(new Date(1723838225894).toISOString())
  })

  it('drops an unassigned/garbage address country rather than failing the transform', () => {
    const order = transformOrder(makeOrder({ address: { city: 'X', country: 'Nowhereland' } }))
    expect(() => OrderSchema.parse(order)).not.toThrow()
    expect(order.billingAddress?.country).toBeUndefined()
  })

  it('preserves the complete raw payload in metadata', () => {
    const raw = makeOrder()
    const order = transformOrder(raw)
    expect(order.metadata).toEqual(raw)
  })

  it('untransformOrderTags splits "key:value" tags into a map and numbers the rest', () => {
    const body = untransformOrderTags({ tags: ['Source:api', 'vip'] })
    expect(body).toEqual({ tags: { Source: 'api', tag2: 'vip' } })
  })

  it('untransformOrderTags returns an empty map when there are no tags', () => {
    expect(untransformOrderTags({})).toEqual({ tags: {} })
  })
})
