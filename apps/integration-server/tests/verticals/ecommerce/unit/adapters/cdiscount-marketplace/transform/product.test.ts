/**
 * Doc: https://developer.octopia-io.net/api-reference/product-management/
 * (verbatim GET /products response example quoted in the source file header).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawOctopiaProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<RawOctopiaProduct> = {}): RawOctopiaProduct {
  return {
    reference: 'A58BC78',
    label: 'SAMSUNG Galaxy Note 20 256Go Black',
    gtin: '8806088879093',
    groupReference: 'AZ1234',
    description: 'A stunning array of mystic hues that redefine work and play',
    language: 'fr-FR',
    category: { label: 'SMARTPHONE', reference: '070302', referencePath: '07/0703/070302' },
    ...overrides,
  }
}

describe('transformProduct (Cdiscount Marketplace / Octopia)', () => {
  it('maps reference to id and label to title', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('A58BC78')
    expect(result.title).toBe('SAMSUNG Galaxy Note 20 256Go Black')
    expect(result.description).toBe('A stunning array of mystic hues that redefine work and play')
    expect(result.productType).toBe('SMARTPHONE')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeRaw()))).not.toThrow()
  })

  it('satisfies ProductSchema even without a category', () => {
    const raw = makeRaw()
    delete raw.category
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})

describe('untransformProduct (Cdiscount Marketplace / Octopia)', () => {
  it('builds a POST /products-integration entry keyed by reference/label', () => {
    const body = untransformProduct({ id: 'A58BC78', title: 'New title', description: 'New desc' })
    expect(body).toEqual({ reference: 'A58BC78', label: 'New title', description: 'New desc' })
  })

  it('omits description when not supplied', () => {
    const body = untransformProduct({ id: 'A58BC78', title: 'New title' })
    expect(body).toEqual({ reference: 'A58BC78', label: 'New title' })
  })
})
