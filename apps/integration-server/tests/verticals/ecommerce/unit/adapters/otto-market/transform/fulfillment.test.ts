/**
 * OTTO Market Shipment → canonical Fulfillment.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/shipments
 * Confirmed: `shipmentId`, `creationDate`, `trackingKey.{carrier,
 * trackingNumber}`. The order-linking field is not shown with a worked JSON
 * example — these tests cover the defensive extraction AND the data-integrity
 * rule it exists to enforce: `orderId` is required and used for joins, so a
 * genuinely un-linkable shipment throws rather than get a placeholder id.
 */
import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawOttoShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/otto-market/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawOttoShipment> = {}): RawOttoShipment {
  return {
    shipmentId: 'ship-1',
    creationDate: '2026-02-03T12:00:00Z',
    trackingKey: { carrier: 'DHL', trackingNumber: '1234567890' },
    positionItems: [{ positionItemId: 'pi-1', quantity: 2 }],
    salesOrderId: 'so-1001',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps confirmed shipment and tracking fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('ship-1')
    expect(result.carrier).toBe('DHL')
    expect(result.trackingNumber).toBe('1234567890')
    expect(result.shippedAt).toBe('2026-02-03T12:00:00Z')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps position items to canonical line items', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toEqual([{ lineItemId: 'pi-1', quantity: 2 }])
  })

  it('derives orderId from salesOrderId when present', () => {
    expect(transformFulfillment(makeShipment()).orderId).toBe('so-1001')
  })

  it('falls back to orderId, then orderNumber, before giving up', () => {
    expect(
      transformFulfillment(makeShipment({ salesOrderId: undefined, orderId: 'ord-77' })).orderId,
    ).toBe('ord-77')
    expect(
      transformFulfillment(
        makeShipment({ salesOrderId: undefined, orderNumber: 'ORD-77' }),
      ).orderId,
    ).toBe('ORD-77')
  })

  it('throws rather than fabricate a placeholder orderId when none of the three fields is present', () => {
    expect(() =>
      transformFulfillment(
        makeShipment({ salesOrderId: undefined, orderId: undefined, orderNumber: undefined }),
      ),
    ).toThrow(/orderId/i)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(makeShipment()))).not.toThrow()
  })
})

describe('untransformFulfillment', () => {
  it('maps carrier/trackingNumber onto trackingKey and lineItems onto positionItems', () => {
    const body = untransformFulfillment({
      carrier: 'DHL',
      trackingNumber: '999',
      lineItems: [{ lineItemId: 'pi-1', quantity: 3 }],
    })
    expect(body).toEqual({
      trackingKey: { carrier: 'DHL', trackingNumber: '999' },
      positionItems: [{ positionItemId: 'pi-1', quantity: 3 }],
    })
  })

  it('omits trackingKey/positionItems when the canonical data has neither', () => {
    expect(untransformFulfillment({})).toEqual({})
  })
})
