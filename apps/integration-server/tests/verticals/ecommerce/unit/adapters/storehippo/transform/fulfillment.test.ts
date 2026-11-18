import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawStoreHippoFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/storehippo/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'
import { FULFILLMENT } from '../fixtures'

const raw = (): RawStoreHippoFulfillment => structuredClone(FULFILLMENT) as RawStoreHippoFulfillment

describe('StoreHippo transformFulfillment (documented ms-fulfillments example)', () => {
  it('maps the documented list example and parses with FulfillmentSchema', () => {
    const f = FulfillmentSchema.parse(transformFulfillment(raw()))
    expect(f).toMatchObject({
      id: '5d6f5f627ab56e2439cf308e',
      orderId: '5d6f5f367ab56e2439cf2dc4',
      status: 'PENDING',
      trackingNumber: '5454185465',
      carrier: 'delhivery',
      service: 'manual',
      shipmentId: '5d6f5f6303813f17e224dde8',
      createdAt: '2019-09-04T06:53:22.970Z',
      updatedAt: '2019-09-04T06:53:23.267Z',
    })
    expect(f.lineItems).toEqual([{ lineItemId: '5d6f5f367ab56e2439cf2d85', quantity: 1 }])
  })

  it.each([
    ['Shipped', 'OPEN'],
    ['Fulfilled', 'SUCCESS'],
    ['Cancelled', 'CANCELLED'],
    ['returned', 'unknown'],
  ])('status %s maps to %s', (status, expected) => {
    expect(FulfillmentSchema.parse(transformFulfillment({ ...raw(), status })).status).toBe(
      expected,
    )
  })

  it('throws on a record without order_id', () => {
    expect(() => transformFulfillment({ ...raw(), order_id: undefined })).toThrow(/order_id/)
  })

  it('untransformFulfillment keeps the tracking number', () => {
    expect(untransformFulfillment({ trackingNumber: 'T1' })['trackingNumber']).toBe('T1')
  })
})
