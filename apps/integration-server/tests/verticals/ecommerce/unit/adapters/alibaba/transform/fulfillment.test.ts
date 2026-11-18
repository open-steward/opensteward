import { describe, it, expect } from 'vitest'
import {
  parseFulfillmentId,
  transformFulfillments,
  type RawAlibabaLogistics,
} from '../../../../../../../src/verticals/ecommerce/adapters/alibaba/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'
import { LOGISTICS_QUERY } from '../fixtures'

const value = LOGISTICS_QUERY.value as unknown as RawAlibabaLogistics

describe('alibaba transformFulfillments (documented logistics query value)', () => {
  it('makes one fulfillment per shipping_order_list entry and parses each', () => {
    const [f, ...rest] = transformFulfillments('T1', value).map((x) => FulfillmentSchema.parse(x))
    expect(rest).toHaveLength(0)
    expect(f).toMatchObject({
      id: 'T1:0',
      orderId: 'T1',
      trackingNumber: '123432',
      carrier: 'EX_ASP_OCEAN_EXPRESS',
      service: 'EXPRESS',
    })
    // No documented logistic_status value set: status is not guessed.
    expect(f!.status).toBeUndefined()
    expect(f!.metadata['logistic_status']).toBe('CONFIRM_RECEIPT')
  })

  it('numbers several shipments in list order', () => {
    const two = {
      ...value,
      shipping_order_list: [{ voucher: { tracking_number: 'A' } }, { voucher: {} }],
    }
    const out = transformFulfillments('T2', two).map((x) => FulfillmentSchema.parse(x))
    expect(out.map((f) => [f.id, f.trackingNumber])).toEqual([
      ['T2:0', 'A'],
      ['T2:1', undefined],
    ])
  })

  it('an order with no shipping_order_list has no fulfillments', () => {
    expect(transformFulfillments('T3', { logistic_status: 'X' })).toEqual([])
  })

  it('parses ids back', () => {
    expect(parseFulfillmentId('271207727001028893:2')).toEqual({
      tradeId: '271207727001028893',
      index: 2,
    })
    expect(parseFulfillmentId('nocolon')).toBeUndefined()
    expect(parseFulfillmentId('T:x')).toBeUndefined()
  })
})
