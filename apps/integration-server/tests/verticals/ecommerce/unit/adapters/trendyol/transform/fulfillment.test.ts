import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/fulfillment'
import type { RawTrendyolOrder } from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawTrendyolOrder> = {}): RawTrendyolOrder {
  return {
    shipmentPackageId: 987654321,
    orderNumber: 'TY-2024-001',
    shipmentPackageStatus: 'Shipped',
    orderDate: 1704067200000, // 2024-01-01T00:00:00.000Z
    lastModifiedDate: 1704153600000, // 2024-01-02T00:00:00.000Z
    cargoTrackingNumber: 'TRK123456',
    cargoTrackingLink: 'https://track.example.com/TRK123456',
    cargoProviderName: 'MNG Kargo',
    lines: [
      { lineId: 111, quantity: 1 },
      { lineId: 222, quantity: 2 },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (Trendyol)', () => {
  it('maps id and orderId from shipmentPackageId', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.id).toBe('987654321')
    expect(result.orderId).toBe('987654321')
  })

  it('maps Shipped status → SUCCESS', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps Delivered → SUCCESS', () => {
    const result = transformFulfillment(makeOrder({ shipmentPackageStatus: 'Delivered' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps Created → OPEN', () => {
    const result = transformFulfillment(makeOrder({ shipmentPackageStatus: 'Created' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps Cancelled → CANCELLED', () => {
    const result = transformFulfillment(makeOrder({ shipmentPackageStatus: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking fields from cargo fields', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.trackingNumber).toBe('TRK123456')
    expect(result.trackingUrl).toBe('https://track.example.com/TRK123456')
    expect(result.carrier).toBe('MNG Kargo')
  })

  it('maps line items from lines array', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.lineItemId).toBe('111')
    expect(result.lineItems![0]!.quantity).toBe(1)
    expect(result.lineItems![1]!.quantity).toBe(2)
  })

  it('converts epoch ms timestamps to ISO strings', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeOrder())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
