import { describe, it, expect } from 'vitest'
import {
  transformLogicommerceProduct,
  type RawLogicommerceProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/lc-product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'
import { fixture } from '../fixtures/load'

const listed = fixture<{ PRODUCTS: RawLogicommerceProduct[] }>('products').PRODUCTS[0]!
const single = fixture<RawLogicommerceProduct>('product')

describe('transformLogicommerceProduct', () => {
  it.each([
    ['GET /products row', listed],
    ['GET /products/{id}', single],
  ])('maps the documented %s example to a valid canonical Product', (_label, raw) => {
    const out = ProductSchema.parse(transformLogicommerceProduct(raw))
    expect(out.id).toBe('1')
    expect(out.title).toBe('Product name')
    expect(out.description).toBe('Product long description')
    expect(out.metadata).toEqual(raw)
  })

  it('maps no variants or prices: combinations carry no price', () => {
    const out = transformLogicommerceProduct(listed)
    expect(out.variants).toBeUndefined()
  })

  it('takes the first language with a non-empty NAME', () => {
    const out = transformLogicommerceProduct({
      ID: 7,
      LANGUAGES: [
        { LANGUAGE: 'ES', NAME: '' },
        { LANGUAGE: 'EN', NAME: 'Hat', LONGDESCRIPTION: 'A hat' },
      ],
    })
    expect(out.title).toBe('Hat')
    expect(out.description).toBe('A hat')
  })

  it('throws rather than invent a title when no language carries a NAME', () => {
    expect(() => transformLogicommerceProduct({ ID: 7, LANGUAGES: [] })).toThrow(/no LANGUAGES/)
  })

  it('throws rather than invent an id', () => {
    expect(() => transformLogicommerceProduct({ LANGUAGES: [{ NAME: 'x' }] })).toThrow(/no ID/)
  })
})
