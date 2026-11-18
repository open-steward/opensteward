import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawVtexPackage,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makePackage(overrides: Partial<RawVtexPackage> = {}): RawVtexPackage {
  return {
    invoiceNumber: 'INV-001',
    invoiceValue: 10990,
    trackingNumber: '1Z999AA10123456784',
    trackingUrl: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
    courier: 'UPS',
    warehouseId: 'WH-SP-01',
    issuanceDate: '2024-05-02T08:00:00.000Z',
    type: 'Output',
    items: [
      { itemIndex: 0, quantity: 2, price: 9990 },
      { itemIndex: 1, quantity: 1, price: 1000 },
    ],
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('composes id as {orderId}:{invoiceNumber}', () => {
    const result = transformFulfillment(makePackage(), 'ORD-1001-01')
    expect(result.id).toBe('ORD-1001-01:INV-001')
  })

  it('falls back id to {orderId}:{trackingNumber} when invoiceNumber absent', () => {
    const result = transformFulfillment(makePackage({ invoiceNumber: undefined }), 'ORD-1001-01')
    expect(result.id).toBe('ORD-1001-01:1Z999AA10123456784')
  })

  it('maps orderId, carrier, trackingNumber, trackingUrl, locationId', () => {
    const result = transformFulfillment(makePackage(), 'ORD-1001-01')
    expect(result.orderId).toBe('ORD-1001-01')
    expect(result.carrier).toBe('UPS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.trackingUrl).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784')
    expect(result.locationId).toBe('WH-SP-01')
  })

  it('maps status to OPEN when invoiceNumber present but no courierStatus', () => {
    const result = transformFulfillment(makePackage({ courierStatus: undefined }), 'ORD-1001-01')
    expect(result.status).toBe('OPEN')
  })

  it('maps status to SUCCESS when courierStatus.finished is true', () => {
    const result = transformFulfillment(
      makePackage({ courierStatus: { finished: true } }),
      'ORD-1001-01',
    )
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status to PENDING when no invoiceNumber and no courierStatus', () => {
    const result = transformFulfillment(
      makePackage({ invoiceNumber: undefined, courierStatus: undefined }),
      'ORD-1001-01',
    )
    expect(result.status).toBe('PENDING')
  })

  it('maps line items from package items', () => {
    const result = transformFulfillment(makePackage(), 'ORD-1001-01')
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: '0', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: '1', quantity: 1 })
  })

  it('maps issuanceDate to shippedAt and createdAt', () => {
    const result = transformFulfillment(makePackage(), 'ORD-1001-01')
    expect(result.shippedAt).toBe('2024-05-02T08:00:00.000Z')
    expect(result.createdAt).toBe('2024-05-02T08:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePackage()
    const result = transformFulfillment(raw, 'ORD-1001-01')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makePackage(), 'ORD-1001-01')
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment', () => {
  it('extracts invoiceNumber from the composite id', () => {
    const canonical = transformFulfillment(makePackage(), 'ORD-1001-01')
    const raw = untransformFulfillment(canonical)
    expect(raw['invoiceNumber']).toBe('INV-001')
  })

  it('round-trips carrier, trackingNumber, trackingUrl', () => {
    const canonical = transformFulfillment(makePackage(), 'ORD-1001-01')
    const raw = untransformFulfillment(canonical)
    expect(raw['courier']).toBe('UPS')
    expect(raw['trackingNumber']).toBe('1Z999AA10123456784')
    expect(raw['trackingUrl']).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784')
    expect(raw['type']).toBe('Output')
  })

  it('maps lineItems back to VTEX items array', () => {
    const canonical = transformFulfillment(makePackage(), 'ORD-1001-01')
    const raw = untransformFulfillment(canonical)
    const items = raw['items'] as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ id: '0', quantity: 2 })
    expect(items[1]).toEqual({ id: '1', quantity: 1 })
  })
})
