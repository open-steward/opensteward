/**
 * Marketplacer shipmentCreate transform (create-only).
 * Docs: https://api.marketplacer.com/docs/seller-api/reference/mutations/shipmentcreate/
 */
import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/marketplacer/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

describe('untransformFulfillment (Marketplacer shipmentCreate input)', () => {
  it('builds the mutation input from orderId + lineItems + metadata.postageCarrierId', () => {
    const input = untransformFulfillment({
      orderId: 'SW52b2ljZS0xMzczNw==',
      trackingNumber: '85b2693f-44c2-4248-b631-eb191dfe287d',
      shippedAt: '2024-03-27T00:08:29.581Z',
      metadata: { postageCarrierId: 'U2hpcG1lbnRDYXJyaWVyLTY4', note: 'Leave at front door' },
      lineItems: [{ lineItemId: 'TGluZUl0ZW0tNDA5Nw==', quantity: 2 }],
    })
    expect(input).toEqual({
      invoiceId: 'SW52b2ljZS0xMzczNw==',
      dispatchedAt: '2024-03-27T00:08:29.581Z',
      note: 'Leave at front door',
      postageCarrierId: 'U2hpcG1lbnRDYXJyaWVyLTY4',
      trackingNumber: '85b2693f-44c2-4248-b631-eb191dfe287d',
      shippedItems: [{ lineItemId: 'TGluZUl0ZW0tNDA5Nw==', quantity: 2 }],
    })
  })

  it('throws without orderId', () => {
    expect(() =>
      untransformFulfillment({ metadata: { postageCarrierId: 'c1' }, lineItems: [{ lineItemId: 'li1', quantity: 1 }] }),
    ).toThrow(/requires orderId/)
  })

  it('throws without metadata.postageCarrierId, rather than sending an invalid mutation', () => {
    expect(() =>
      untransformFulfillment({ orderId: 'inv1', lineItems: [{ lineItemId: 'li1', quantity: 1 }] }),
    ).toThrow(/postageCarrierId/)
  })

  it('throws without at least one lineItems entry', () => {
    expect(() =>
      untransformFulfillment({ orderId: 'inv1', metadata: { postageCarrierId: 'c1' }, lineItems: [] }),
    ).toThrow(/at least one lineItems/)
  })
})

describe('transformFulfillment (Marketplacer shipmentCreate response)', () => {
  it('combines the minimal response with the request that produced it', () => {
    const request = untransformFulfillment({
      orderId: 'inv1',
      trackingNumber: 'TRACK123',
      shippedAt: '2024-03-27T00:08:29.581Z',
      metadata: { postageCarrierId: 'carrier1' },
      lineItems: [{ lineItemId: 'li1', quantity: 2 }],
    })
    const result = transformFulfillment({ id: 'ShipmentId-1' }, request)
    expect(result.id).toBe('ShipmentId-1')
    expect(result.orderId).toBe('inv1')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('TRACK123')
    expect(result.lineItems).toEqual([{ lineItemId: 'li1', quantity: 2 }])
  })

  it('produces schema-valid output', () => {
    const request = untransformFulfillment({
      orderId: 'inv1',
      metadata: { postageCarrierId: 'carrier1' },
      lineItems: [{ lineItemId: 'li1', quantity: 1 }],
    })
    const result = transformFulfillment({ id: 'ship1' }, request)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
