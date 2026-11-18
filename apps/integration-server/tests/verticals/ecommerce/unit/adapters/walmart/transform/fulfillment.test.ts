import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  extractFulfillmentsFromOrder,
  untransformFulfillment,
  type RawWalmartShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/walmart/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(
  overrides: Partial<RawWalmartShipment> = {},
): RawWalmartShipment {
  return {
    orderId: 'PO-2024050100001',
    lineNumber: '1',
    status: 'Shipped',
    trackingNumber: '1Z999AA10123456784',
    carrier: 'UPS',
    trackingUrl: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
    shipDateTime: '2024-05-02T08:00:00.000Z',
    methodCode: 'Standard',
    ...overrides,
  }
}

describe('transformFulfillment (Walmart)', () => {
  it('synthesizes id from orderId and trackingNumber', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('PO-2024050100001:1Z999AA10123456784')
    expect(result.orderId).toBe('PO-2024050100001')
  })

  it('falls back to lineNumber for id when no tracking number', () => {
    const result = transformFulfillment(
      makeShipment({ trackingNumber: undefined }),
    )
    expect(result.id).toBe('PO-2024050100001:1')
  })

  it('maps Shipped status to SUCCESS', () => {
    expect(transformFulfillment(makeShipment()).status).toBe('SUCCESS')
  })

  it('maps Delivered status to SUCCESS', () => {
    const result = transformFulfillment(makeShipment({ status: 'Delivered' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformFulfillment(makeShipment({ status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown status to PENDING', () => {
    const result = transformFulfillment(makeShipment({ status: 'Processing' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps carrier, tracking, and service fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('UPS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.trackingUrl).toBe(
      'https://www.ups.com/track?tracknum=1Z999AA10123456784',
    )
    expect(result.service).toBe('Standard')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata['methodCode']).toBe('Standard')
  })
})

describe('extractFulfillmentsFromOrder (Walmart)', () => {
  it('extracts fulfillments from shipped order lines', () => {
    const orderLines = [
      {
        lineNumber: '1',
        orderLineStatuses: [
          {
            status: 'Shipped',
            trackingInfo: {
              shipDateTime: '2024-05-02T08:00:00.000Z',
              carrierName: { carrier: 'UPS' },
              trackingNumber: '1Z999',
              trackingURL: 'https://ups.com/1Z999',
            },
          },
        ],
        fulfillment: { shipMethod: 'Standard' },
      },
    ]
    const result = extractFulfillmentsFromOrder('PO-001', orderLines)
    expect(result).toHaveLength(1)
    expect(result[0]!.trackingNumber).toBe('1Z999')
  })

  it('returns empty array when no order lines', () => {
    const result = extractFulfillmentsFromOrder('PO-001', undefined)
    expect(result).toEqual([])
  })

  it('skips non-shipped order lines', () => {
    const orderLines = [
      {
        lineNumber: '1',
        orderLineStatuses: [{ status: 'Acknowledged' }],
      },
    ]
    const result = extractFulfillmentsFromOrder('PO-001', orderLines)
    expect(result).toEqual([])
  })
})

describe('untransformFulfillment (Walmart)', () => {
  it('produces Walmart shipping body with line statuses', () => {
    const body = untransformFulfillment({
      orderId: 'PO-001',
      trackingNumber: '1Z999',
      carrier: 'UPS',
      shippedAt: '2024-05-02T08:00:00.000Z',
      lineItems: [{ lineItemId: '1', quantity: 2 }],
    })
    const shipment = body['orderShipment'] as Record<string, unknown>
    const lines = shipment['orderLines'] as Record<string, unknown>
    const lineArr = lines['orderLine'] as unknown[]
    expect(lineArr).toHaveLength(1)
  })
})
