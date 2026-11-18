import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawJumpsellerProduct,
  type RawJumpsellerVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumpseller/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct (jumpseller)', () => {
  const raw: RawJumpsellerProduct = {
    id: 77,
    name: 'Chaqueta Outdoor',
    description: '<p>Chaqueta para montaña.</p>',
    permalink: 'chaqueta-outdoor',
    price: 89.99,
    status: 'available',
    brand: 'MontañaCo',
    currency: 'USD',
    categories: [{ id: 5, name: 'Outdoor' }],
    variants: [
      {
        id: 200,
        price: 89.99,
        compare_price: 109.99,
        stock: 20,
        sku: 'CO-L-RED',
        barcode: '0987654321098',
        weight: 0.8,
        weight_type: 'kg',
        options: [
          { id: 1, option: 'Color', value: 'Red' },
          { id: 2, option: 'Size', value: 'L' },
        ],
      },
    ],
    images: [{ id: 300, url: 'https://cdn.example.com/chaqueta.jpg', position: 0 }],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('77')
  })

  it('maps title from name', () => {
    const result = transformProduct(raw)
    expect(result.title).toBe('Chaqueta Outdoor')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('<p>Chaqueta para montaña.</p>')
  })

  it('maps handle from permalink', () => {
    const result = transformProduct(raw)
    expect(result.handle).toBe('chaqueta-outdoor')
  })

  it('maps available status → ACTIVE', () => {
    const result = transformProduct(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps not-available status → ARCHIVED', () => {
    const result = transformProduct({ ...raw, status: 'not-available' })
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps draft status → DRAFT', () => {
    const result = transformProduct({ ...raw, status: 'draft' })
    expect(result.status).toBe('DRAFT')
  })

  it('maps vendor from brand', () => {
    const result = transformProduct(raw)
    expect(result.vendor).toBe('MontañaCo')
  })

  it('maps categories to tags', () => {
    const result = transformProduct(raw)
    expect(result.tags).toContain('Outdoor')
  })

  it('maps variants with minor-unit prices', () => {
    const result = transformProduct(raw)
    expect(result.variants).toHaveLength(1)
    // 89.99 USD → 8999
    expect(result.variants![0]!.price).toEqual({ amount: 8999, currency: 'USD' })
    // compare_price 109.99 → 10999
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 10999, currency: 'USD' })
    expect(result.variants![0]!.sku).toBe('CO-L-RED')
  })

  it('maps optionValues on variants from options array', () => {
    const result = transformProduct(raw)
    expect(result.variants![0]!.optionValues).toEqual({ Color: 'Red', Size: 'L' })
  })

  it('maps images', () => {
    const result = transformProduct(raw)
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/chaqueta.jpg')
  })

  it('produces schema-valid output', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const result = transformProduct(raw)
    const back = untransformProduct(result)
    expect(back.name).toBe(raw.name)
    expect(back.permalink).toBe(raw.permalink)
    expect(back.status).toBe('available')
    expect(back.brand).toBe('MontañaCo')
  })
})

describe('transformVariant (jumpseller)', () => {
  const rawVariant: RawJumpsellerVariant = {
    id: 200,
    price: 89.99,
    compare_price: 109.99,
    stock: 20,
    sku: 'CO-L-RED',
    barcode: '0987654321098',
    weight: 0.8,
    weight_type: 'kg',
    options: [{ option: 'Color', value: 'Red' }],
  }

  it('maps id to string', () => {
    const result = transformVariant(rawVariant, 'USD')
    expect(result.id).toBe('200')
  })

  it('maps price to minor units', () => {
    const result = transformVariant(rawVariant, 'USD')
    // 89.99 → 8999
    expect(result.price).toEqual({ amount: 8999, currency: 'USD' })
  })

  it('maps compareAtPrice', () => {
    const result = transformVariant(rawVariant, 'USD')
    // 109.99 → 10999
    expect(result.compareAtPrice).toEqual({ amount: 10999, currency: 'USD' })
  })

  it('maps sku and barcode', () => {
    const result = transformVariant(rawVariant, 'USD')
    expect(result.sku).toBe('CO-L-RED')
    expect(result.barcode).toBe('0987654321098')
  })

  it('maps weightUnit from weight_type', () => {
    const result = transformVariant(rawVariant, 'USD')
    expect(result.weightUnit).toBe('kg')
  })

  it('maps optionValues from options array', () => {
    const result = transformVariant(rawVariant, 'USD')
    expect(result.optionValues).toEqual({ Color: 'Red' })
  })

  it('produces schema-valid output', () => {
    const result = transformVariant(rawVariant, 'USD')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})
