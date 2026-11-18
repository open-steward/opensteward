import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawFastspringProduct,
} from '../../../../../../../src/verticals/payments/adapters/fastspring/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('fastspring transformProduct', () => {
  it('maps a product with English localized display name', () => {
    const raw: RawFastspringProduct = {
      product: 'my-product-path',
      display: { en: 'My Product', fr: 'Mon Produit' },
      description: {
        summary: { en: 'Short summary' },
        full: { en: 'Full description text' },
      },
      sku: 'SKU-001',
      format: 'digital',
      image: 'https://example.com/image.png',
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('my-product-path')
    expect(result.name).toBe('My Product')
    expect(result.description).toBe('Short summary')
    expect(result.gateway).toBe('fastspring')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps a product with a plain string display name', () => {
    const raw: RawFastspringProduct = {
      product: 'simple-product',
      display: 'Simple Product',
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('simple-product')
    expect(result.name).toBe('Simple Product')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('falls back to product path as name when display is absent', () => {
    const raw: RawFastspringProduct = {
      product: 'fallback-product',
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('fallback-product')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('prefers summary over full description', () => {
    const raw: RawFastspringProduct = {
      product: 'desc-product',
      display: 'Desc Product',
      description: {
        summary: { en: 'Summary text' },
        full: { en: 'Full text' },
      },
    }
    const result = transformProduct(raw)
    expect(result.description).toBe('Summary text')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
