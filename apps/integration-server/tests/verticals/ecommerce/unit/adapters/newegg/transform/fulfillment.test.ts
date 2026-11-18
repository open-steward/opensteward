import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawNeweggPackage,
} from '../../../../../../../src/verticals/ecommerce/adapters/newegg/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makePackage(
  overrides: Partial<RawNeweggPackage> = {},
): RawNeweggPackage {
  return {
    OrderNumber: 'NE-2024050100001',
    PackageType: 'SmallPackage',
    ShipCarrier: 'UPS',
    ShipService: 'Ground',
    TrackingNumber: '1Z999AA10123456784',
    ShipDate: '2024-05-02T08:00:00.000Z',
    ItemList: [
      {
        SellerPartNumber: 'GPU-RTX4090-24G',
        Quantity: 1,
      },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (Newegg)', () => {
  it('synthesizes id from OrderNumber and TrackingNumber', () => {
    const result = transformFulfillment(makePackage())
    expect(result.id).toBe('NE-2024050100001:1Z999AA10123456784')
    expect(result.orderId).toBe('NE-2024050100001')
  })

  it('falls back to pkg suffix for id when no tracking number', () => {
    const result = transformFulfillment(
      makePackage({ TrackingNumber: undefined }),
    )
    expect(result.id).toBe('NE-2024050100001:pkg')
  })

  it('maps package with tracking to SUCCESS status', () => {
    expect(transformFulfillment(makePackage()).status).toBe('SUCCESS')
  })

  it('maps package without tracking to PENDING status', () => {
    const result = transformFulfillment(makePackage({ TrackingNumber: undefined }))
    expect(result.status).toBe('PENDING')
  })

  it('maps carrier, tracking, and service fields', () => {
    const result = transformFulfillment(makePackage())
    expect(result.carrier).toBe('UPS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.service).toBe('Ground')
  })

  it('maps item list to line items', () => {
    const result = transformFulfillment(makePackage())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toMatchObject({
      lineItemId: 'GPU-RTX4090-24G',
      quantity: 1,
    })
  })

  it('returns undefined lineItems when ItemList is empty', () => {
    const result = transformFulfillment(makePackage({ ItemList: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('returns undefined lineItems when ItemList is missing', () => {
    const result = transformFulfillment(makePackage({ ItemList: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makePackage())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const raw = makePackage()
    const result = transformFulfillment(raw)
    expect(result.metadata['PackageType']).toBe('SmallPackage')
    expect(result.metadata['ShipCarrier']).toBe('UPS')
  })
})

describe('untransformFulfillment (Newegg)', () => {
  it('produces Newegg shipment confirmation body with item list', () => {
    const body = untransformFulfillment({
      orderId: 'NE-001',
      trackingNumber: '1Z999',
      carrier: 'UPS',
      service: 'Ground',
      shippedAt: '2024-05-02T08:00:00.000Z',
      lineItems: [{ lineItemId: 'GPU-RTX4090-24G', quantity: 1 }],
    })
    expect(body['ShipCarrier']).toBe('UPS')
    expect(body['ShipService']).toBe('Ground')
    expect(body['TrackingNumber']).toBe('1Z999')
    const itemList = body['ItemList'] as unknown[]
    expect(itemList).toHaveLength(1)
  })

  it('defaults carrier to Other when not provided', () => {
    const body = untransformFulfillment({
      orderId: 'NE-001',
    })
    expect(body['ShipCarrier']).toBe('Other')
    expect(body['ShipService']).toBe('Other')
  })

  it('defaults to empty item list when no lineItems', () => {
    const body = untransformFulfillment({
      orderId: 'NE-001',
      carrier: 'FedEx',
    })
    const itemList = body['ItemList'] as unknown[]
    expect(itemList).toEqual([])
  })
})
