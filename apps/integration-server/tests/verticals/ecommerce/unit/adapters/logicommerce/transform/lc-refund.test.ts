import { describe, it, expect } from 'vitest'
import {
  transformLogicommerceReturn,
  type RawLogicommerceReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/lc-refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'
import { fixture } from '../fixtures/load'

const listed = fixture<{ returns: RawLogicommerceReturn[] }>('order-returns').returns[0]!
const single = fixture<RawLogicommerceReturn>('return')

describe('transformLogicommerceReturn', () => {
  it.each([
    ['GET /orders/{id}/returns row', listed],
    ['GET /returns/{id}', single],
  ])('maps the documented %s example to a valid canonical Refund', (_label, raw) => {
    const out = RefundSchema.parse(transformLogicommerceReturn(raw, '1'))
    expect(out).toMatchObject({
      id: `1:${String(raw.ID)}`,
      orderId: '1',
      createdAt: '2020-06-29T05:52:43.000Z',
    })
    expect(out.amount).toBeUndefined()
    expect(out.metadata).toEqual(raw)
  })
})
