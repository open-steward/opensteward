/**
 * Docs: https://developers.orderchamp.com/manage-orders-fulfilment
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawOrderchampOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/orderchamp/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawOrderchampOrder> = {}): RawOrderchampOrder {
  return {
    id: 'order-1',
    isFulfilled: false,
    createdAt: '2026-01-15T09:30:00Z',
    updatedAt: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformOrder (Orderchamp)', () => {
  it('maps isFulfilled to canonical fulfillmentStatus', () => {
    expect(transformOrder(makeOrder({ isFulfilled: true })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ isFulfilled: false })).fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('leaves fulfillmentStatus undefined rather than guessing when isFulfilled is not reported', () => {
    expect(transformOrder(makeOrder({ isFulfilled: null })).fulfillmentStatus).toBeUndefined()
  })

  it('does not guess financialStatus from the unconfirmed OrderStatus enum', () => {
    expect(transformOrder(makeOrder({ status: 'confirmed' })).financialStatus).toBeUndefined()
  })

  it('preserves raw in metadata (including the raw status)', () => {
    const raw = makeOrder({ status: 'confirmed' })
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
