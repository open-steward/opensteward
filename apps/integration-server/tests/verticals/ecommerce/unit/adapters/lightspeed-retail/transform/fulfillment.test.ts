import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawLightspeedSpecialOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeSpecialOrder(
  overrides: Partial<RawLightspeedSpecialOrder> = {},
): RawLightspeedSpecialOrder {
  return {
    specialOrderID: '301',
    saleID: '5001',
    saleLineID: 'SL_001',
    itemID: '501',
    shopID: '1',
    quantity: '2',
    status: 'Ordered',
    note: 'Rush order',
    createTime: '2024-05-02T09:00:00+00:00',
    timeStamp: '2024-05-03T10:00:00+00:00',
    ...overrides,
  }
}

describe('transformFulfillment (Lightspeed Retail)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeSpecialOrder())
    expect(result.id).toBe('301')
    expect(result.orderId).toBe('5001')
    expect(result.status).toBe('OPEN')
    expect(result.locationId).toBe('1')
  })

  it('maps line items from saleLineID', () => {
    const result = transformFulfillment(makeSpecialOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('SL_001')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps pending status', () => {
    const result = transformFulfillment(makeSpecialOrder({ status: 'Pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps received status to SUCCESS', () => {
    const result = transformFulfillment(makeSpecialOrder({ status: 'Received' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps cancelled status', () => {
    const result = transformFulfillment(makeSpecialOrder({ status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('handles missing saleLineID', () => {
    const result = transformFulfillment(makeSpecialOrder({ saleLineID: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeSpecialOrder()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeSpecialOrder())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
