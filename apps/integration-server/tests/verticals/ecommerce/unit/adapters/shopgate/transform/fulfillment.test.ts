import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopgateFulfillmentOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopgate/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(
  overrides: Partial<RawShopgateFulfillmentOrder> = {},
): RawShopgateFulfillmentOrder {
  return {
    orderNumber: 'FO-001',
    salesOrderNumber: 'SO-2024-001',
    status: 'fulfilled',
    fulfillmentLocationCode: 'WH-EAST',
    tracking: {
      tracking: 'TRK123456',
      trackingUrl: 'https://carrier.example.com/track/TRK123456',
      carrier: 'UPS',
    },
    lineItems: [{ id: 'li-001', quantity: 2, productCode: 'PROD-001', variantCode: 'VAR-001' }],
    createdAt: '2024-04-01T10:00:00.000Z',
    updatedAt: '2024-04-02T09:00:00.000Z',
    ...overrides,
  }
}

describe('shopgate transformFulfillment', () => {
  it('maps orderNumber to id and salesOrderNumber to orderId', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('FO-001')
    expect(result.orderId).toBe('SO-2024-001')
  })

  it('maps fulfilled status to SUCCESS', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps in_progress status to OPEN', () => {
    const result = transformFulfillment(makeRaw({ status: 'in_progress' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps failed status to FAILURE', () => {
    const result = transformFulfillment(makeRaw({ status: 'failed' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps tracking fields (tracking.tracking → trackingNumber)', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.trackingNumber).toBe('TRK123456')
    expect(result.trackingUrl).toBe('https://carrier.example.com/track/TRK123456')
    expect(result.carrier).toBe('UPS')
  })

  it('maps fulfillmentLocationCode to locationId', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.locationId).toBe('WH-EAST')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ lineItemId: 'li-001', quantity: 2 })
  })

  it('produces output that passes FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeRaw())
    const back = untransformFulfillment(canonical)
    expect(back.salesOrderNumber).toBe('SO-2024-001')
    expect((back.tracking as { tracking: string })?.tracking).toBe('TRK123456')
  })
})
