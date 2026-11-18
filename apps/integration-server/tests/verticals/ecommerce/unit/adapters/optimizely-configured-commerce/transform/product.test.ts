/**
 * Optimizely Configured Commerce `transformProduct` — maps the Storefront v1
 * ProductDto to the canonical Product shape. Docs:
 * https://docs.developers.optimizely.com/configured-commerce/reference/productsv1_getcollectionasync
 */
import { describe, it, expect } from 'vitest'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'
import {
  transformProduct,
  type RawOptimizelyProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/transform/product'

describe('Optimizely transformProduct', () => {
  it('produces output that satisfies the canonical Product schema', () => {
    const out = transformProduct({
      id: 'a1b2',
      name: 'Wireless Keyboard',
      shortDescription: 'A compact wireless keyboard.',
      erpNumber: 'WK-2026',
    })
    expect(() => ProductSchema.parse(out)).not.toThrow()
  })

  it('minimal input still satisfies the schema', () => {
    const out = transformProduct({ id: 'min' })
    expect(() => ProductSchema.parse(out)).not.toThrow()
  })

  it('maps id verbatim (already a string/uuid)', () => {
    expect(transformProduct({ id: 'a1b2' }).id).toBe('a1b2')
  })

  it('prefers name for title, falling back to erpNumber then id', () => {
    expect(transformProduct({ id: '1', name: 'Keyboard' }).title).toBe('Keyboard')
    expect(transformProduct({ id: '2', erpNumber: 'ABC' }).title).toBe('ABC')
    expect(transformProduct({ id: '3' }).title).toBe('3')
  })

  it('slugifies erpNumber into a URL-safe handle', () => {
    expect(transformProduct({ id: '4', erpNumber: 'WK 2026!' }).handle).toBe('wk-2026')
  })

  it('preserves the raw record in metadata', () => {
    const raw: RawOptimizelyProduct = { id: '5' }
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('does not throw on missing optional fields', () => {
    expect(() => transformProduct({ id: '' })).not.toThrow()
  })
})
