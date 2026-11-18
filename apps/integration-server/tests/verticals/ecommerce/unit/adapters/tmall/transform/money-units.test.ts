import { describe, it, expect } from 'vitest'
import { transformProduct } from '../../../../../../../src/verticals/ecommerce/adapters/tmall/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

/**
 * Canonical `Money.amount` is an INTEGER in the currency's minor units.
 * Tmall's TOP API reports a price string in major units ("199.99" CNY), and
 * `transformVariant` placed the parsed decimal straight onto `Money.amount`
 * without `majorToMinor`.
 *
 * Whole-yuan fixtures ("199.00" -> 199) parse fine and hide it. A price with
 * fractional yuan does not.
 */

describe('tmall variant prices are converted to minor units', () => {
  it('converts a fractional major-unit price string to fen', () => {
    const out = transformProduct({
      num_iid: 1,
      title: 'p',
      sku: [{ sku_id: 11, price: '199.99', properties_name: 'M' }],
    } as never)
    expect(out.variants?.[0]?.price).toEqual({ amount: 19999, currency: 'CNY' })
    expect(() => ProductSchema.parse(out)).not.toThrow()
  })

  it('converts a whole major-unit price too', () => {
    const out = transformProduct({
      num_iid: 1,
      title: 'p',
      sku: [{ sku_id: 11, price: '199.00', properties_name: 'M' }],
    } as never)
    // The old code returned 199 here and looked correct — this is the fixture
    // shape that masked the bug.
    expect(out.variants?.[0]?.price).toEqual({ amount: 19900, currency: 'CNY' })
  })
})
