import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/ecommerce/adapters/pinduoduo/transform/refund'
import { transformOrder } from '../../../../../../../src/verticals/ecommerce/adapters/pinduoduo/transform/order'
import { transformProduct } from '../../../../../../../src/verticals/ecommerce/adapters/pinduoduo/transform/product'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

/**
 * Canonical `Money.amount` is an INTEGER in the currency's minor units
 * (`ecommerce/schema/shared.ts`). Pinduoduo reports amounts in fen — which IS
 * the minor unit of CNY — and every transform ran them through `fenToYuan`,
 * dividing by 100 and producing a major-unit decimal.
 *
 * So the conversion was not merely unnecessary, it was backwards: it turned a
 * correct minor-unit integer into an invalid major-unit decimal, and every
 * amount was reported at 1/100th of its real value.
 *
 * Whole-hundred fixtures hide both halves of this — 199900 fen / 100 = 1999,
 * still an integer, still parses. These use amounts that do not divide evenly,
 * which is the ordinary case for a real refund or discount.
 *
 * Asserted through `Schema.parse()` rather than on the field alone, because the
 * integer constraint lives in the schema and that is what a caller hits.
 */

const ODD_FEN = 123499 // ¥1234.99 — /100 would give a non-integer

describe('pinduoduo amounts stay in minor units', () => {
  it('reports a refund in fen, unconverted', () => {
    const out = transformRefund({ refund_id: 7, order_sn: 'o1', refund_amount: ODD_FEN } as never)
    expect(out.amount).toEqual({ amount: ODD_FEN, currency: 'CNY' })
    expect(() => RefundSchema.parse(out)).not.toThrow()
  })

  it('reports order totals, shipping and discounts in fen', () => {
    const out = transformOrder({
      order_sn: 'o1',
      order_amount: ODD_FEN,
      freight_amount: 1599,
      discount_amount: 2501,
      item_list: [{ sub_order_sn: 'l1', goods_id: 9, goods_price: 4999, goods_count: 2 }],
    } as never)
    expect(out.totalPrice).toEqual({ amount: ODD_FEN, currency: 'CNY' })
    expect(out.totalShipping).toEqual({ amount: 1599, currency: 'CNY' })
    expect(out.totalDiscounts).toEqual({ amount: 2501, currency: 'CNY' })
    expect(out.lineItems?.[0]?.price).toEqual({ amount: 4999, currency: 'CNY' })
    expect(() => OrderSchema.parse(out)).not.toThrow()
  })

  it('reports a variant price in fen', () => {
    const out = transformProduct({
      goods_id: 1,
      goods_name: 'p',
      sku_list: [{ sku_id: 11, sku_price: ODD_FEN, spec: 'M' }],
    } as never)
    expect(out.variants?.[0]?.price).toEqual({ amount: ODD_FEN, currency: 'CNY' })
    expect(() => ProductSchema.parse(out)).not.toThrow()
  })
})
