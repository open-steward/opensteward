import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawBolShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/bol/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawBolShipment> = {}): RawBolShipment {
  return {
    shipmentId: '914587795',
    shipmentDateTime: '2024-11-21T08:30:00+01:00',
    shipmentReference: 'REF-001',
    orderId: '1043946570',
    shipmentItems: [
      {
        orderItemId: 'BFC0000000000001',
        orderId: '1043946570',
        quantity: 2,
      },
    ],
    transport: {
      transportId: 'TRN-001',
      transporterCode: 'TNT',
      trackAndTrace: '3STGNL1234567890',
    },
    ...overrides,
  }
}

describe('transformFulfillment (Bol.com)', () => {
  it('uses shipmentId as the canonical id and maps carrier/tracking', () => {
    const f = transformFulfillment(makeShipment())
    expect(f.id).toBe('914587795')
    expect(f.orderId).toBe('1043946570')
    expect(f.trackingNumber).toBe('3STGNL1234567890')
    expect(f.carrier).toBe('TNT')
    expect(f.status).toBe('SUCCESS')
  })

  it('infers PENDING status when no shipmentDateTime', () => {
    const f = transformFulfillment(
      makeShipment({ shipmentDateTime: undefined }),
    )
    expect(f.status).toBe('PENDING')
  })

  it('maps line items correctly', () => {
    const f = transformFulfillment(makeShipment())
    expect(f.lineItems).toHaveLength(1)
    expect(f.lineItems![0]).toEqual({ lineItemId: 'BFC0000000000001', quantity: 2 })
  })

  it('derives orderId from shipmentItems when orderId is not top-level', () => {
    const f = transformFulfillment(
      makeShipment({
        orderId: undefined,
        shipmentItems: [
          { orderItemId: 'OI-1', orderId: 'ORD-999', quantity: 1 },
        ],
      }),
    )
    expect(f.orderId).toBe('ORD-999')
  })

  it('emits one canonical fulfillment per Bol.com shipment', () => {
    const list = transformFulfillments([
      makeShipment({ shipmentId: '111' }),
      makeShipment({ shipmentId: '222', shipmentDateTime: undefined }),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('111')
    expect(list[0]!.status).toBe('SUCCESS')
    expect(list[1]!.id).toBe('222')
    expect(list[1]!.status).toBe('PENDING')
  })

  it('returns empty array for undefined items', () => {
    expect(transformFulfillments(undefined)).toEqual([])
    expect(transformFulfillments([])).toEqual([])
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const f = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(f)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeShipment())
    const body = untransformFulfillment(canonical)
    const transport = body['transport'] as Record<string, unknown>
    expect(transport['trackAndTrace']).toBe('3STGNL1234567890')
    expect(transport['transporterCode']).toBe('TNT')
    const items = body['orderItems'] as Array<Record<string, unknown>>
    expect(items[0]!['orderItemId']).toBe('BFC0000000000001')
  })
})
