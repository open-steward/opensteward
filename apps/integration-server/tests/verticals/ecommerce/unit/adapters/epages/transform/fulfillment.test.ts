/**
 * ePages Beyond shipping process ↔ canonical Fulfillment.
 * Docs: https://api-docs.beyondshop.cloud/ng-order-order-public-api.html (shipping processes)
 */
import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawEpagesShippingProcess,
} from '../../../../../../../src/verticals/ecommerce/adapters/epages/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipping(overrides: Partial<RawEpagesShippingProcess> = {}): RawEpagesShippingProcess {
  return {
    _id: 's1',
    status: 'PENDING',
    trackingCode: '1Z999AA1',
    trackingLink: 'https://track.example/1Z999AA1',
    comment: 'Fragile',
    lineItems: [{ productLineItemId: 'li1', quantity: 2 }],
    ...overrides,
  }
}

describe('transformFulfillment (ePages Beyond)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeShipping(), 'o1')
    expect(result.id).toBe('s1')
    expect(result.orderId).toBe('o1')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('1Z999AA1')
    expect(result.trackingUrl).toBe('https://track.example/1Z999AA1')
    expect(result.lineItems).toEqual([{ lineItemId: 'li1', quantity: 2 }])
  })

  it.each([
    ['SHIPPED', 'SUCCESS'],
    ['DELIVERED', 'SUCCESS'],
    ['PENDING', 'PENDING'],
  ])('maps status %s to %s', (raw, expected) => {
    expect(transformFulfillment(makeShipping({ status: raw }), 'o1').status).toBe(expected)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeShipping()
    expect(transformFulfillment(raw, 'o1').metadata).toBe(raw)
  })

  it('satisfies FulfillmentSchema', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(makeShipping(), 'o1'))).not.toThrow()
  })
})

describe('untransformFulfillment (ePages Beyond)', () => {
  it('requires lineItems', () => {
    expect(() => untransformFulfillment({ trackingNumber: 'x' })).toThrow(/requires `lineItems`/)
  })

  it('builds the create body', () => {
    const body = untransformFulfillment({
      trackingNumber: 'TRACK1',
      trackingUrl: 'https://track.example/TRACK1',
      notifyCustomer: true,
      lineItems: [{ lineItemId: 'li1', quantity: 1 }],
    }) as Record<string, unknown>
    expect(body.trackingCode).toBe('TRACK1')
    expect(body.trackingLink).toBe('https://track.example/TRACK1')
    expect(body.sendMail).toBe(true)
    expect(body.lineItems).toEqual([{ productLineItemId: 'li1', quantity: 1 }])
  })
})
