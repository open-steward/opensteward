import { describe, it, expect } from 'vitest'
import { transformFulfillment } from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/fulfillment'
import type { RawCtOrder } from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawCtOrder> = {}): RawCtOrder {
  return {
    id: 'order-1',
    orderState: 'Confirmed',
    shipmentState: 'Shipped',
    createdAt: '2024-05-01T10:00:00Z',
    lastModifiedAt: '2024-05-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (commercetools)', () => {
  it('projects Shipped shipmentState as SUCCESS', () => {
    const r = transformFulfillment(makeOrder())
    expect(r.id).toBe('order-1')
    expect(r.orderId).toBe('order-1')
    expect(r.status).toBe('SUCCESS')
  })

  it('projects Partial shipmentState as OPEN', () => {
    const r = transformFulfillment(makeOrder({ shipmentState: 'Partial' }))
    expect(r.status).toBe('OPEN')
  })

  it('omits status when shipmentState is undefined', () => {
    const r = transformFulfillment(makeOrder({ shipmentState: undefined }))
    expect(r.status).toBeUndefined()
  })

  it('documents itself via metadata.note', () => {
    const r = transformFulfillment(makeOrder())
    expect(r.metadata['note']).toMatch(/projection/i)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const r = transformFulfillment(makeOrder())
    expect(() => FulfillmentSchema.parse(r)).not.toThrow()
  })
})
