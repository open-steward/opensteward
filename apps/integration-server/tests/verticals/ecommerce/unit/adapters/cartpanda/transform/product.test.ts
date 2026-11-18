import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawCartpandaProduct,
  type RawCartpandaVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/cartpanda/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawCartpandaVariant> = {}): RawCartpandaVariant {
  return {
    id: 501,
    product_id: 100,
    title: 'P / Preta',
    price: '59.90',
    compare_at_price: '79.90',
    sku: 'CAM-P-PRETA',
    barcode: '7890000000001',
    position: 1,
    inventory_item_id: 8001,
    quantity: 10,
    weight: 0.3,
    weight_unit: 'kg',
    taxable: true,
    requires_shipping: true,
    option1: 'P',
    option2: 'Preta',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawCartpandaProduct> = {}): RawCartpandaProduct {
  return {
    id: 100,
    title: 'Camiseta Básica',
    body_html: '<p>Descrição</p>',
    handle: 'camiseta-basica',
    status: 'active',
    vendor: 'MarcaBR',
    product_type: 'Apparel',
    tags: 'sale, summer',
    options: [
      { id: 1, name: 'Tamanho', position: 1, values: ['P', 'M', 'G'] },
      { id: 2, name: 'Cor', position: 2, values: ['Preta', 'Branca'] },
    ],
    variants: [makeVariant()],
    images: [{ id: 701, src: 'https://example.com/img.jpg', alt: 'Front view', position: 1 }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformVariant', () => {
  it('maps id and productId to strings', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('501')
    expect(result.productId).toBe('100')
  })

  it('converts price to minor units (BRL by default)', () => {
    // 59.90 BRL → 5990 minor units
    const result = transformVariant(makeVariant())
    expect(result.price).toEqual({ amount: 5990, currency: 'BRL' })
  })

  it('converts compareAtPrice to minor units', () => {
    const result = transformVariant(makeVariant())
    expect(result.compareAtPrice).toEqual({ amount: 7990, currency: 'BRL' })
  })

  it('maps sku and barcode', () => {
    const result = transformVariant(makeVariant())
    expect(result.sku).toBe('CAM-P-PRETA')
    expect(result.barcode).toBe('7890000000001')
  })

  it('maps weight unit "kg"', () => {
    const result = transformVariant(makeVariant())
    expect(result.weightUnit).toBe('kg')
  })

  it('builds optionValues from option1/option2 when options provided', () => {
    const options = [
      { id: 1, name: 'Tamanho', position: 1, values: ['P'] },
      { id: 2, name: 'Cor', position: 2, values: ['Preta'] },
    ]
    const result = transformVariant(makeVariant(), 'BRL', options)
    expect(result.optionValues).toEqual({ Tamanho: 'P', Cor: 'Preta' })
  })
})

describe('transformProduct', () => {
  it('maps core product fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('100')
    expect(result.title).toBe('Camiseta Básica')
    expect(result.handle).toBe('camiseta-basica')
    expect(result.description).toBe('<p>Descrição</p>')
  })

  it('maps status "active" to ACTIVE', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status "draft" to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('splits tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['sale', 'summer'])
  })

  it('maps options array', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Tamanho')
  })

  it('maps variants with option values resolved', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.optionValues).toEqual({ Tamanho: 'P', Cor: 'Preta' })
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://example.com/img.jpg')
    expect(result.images![0]!.alt).toBe('Front view')
  })

  it('falls back to image_url when src is missing', () => {
    const raw = makeProduct({
      images: [{ id: 702, image_url: 'https://example.com/alt.jpg' }],
    })
    const result = transformProduct(raw)
    expect(result.images![0]!.url).toBe('https://example.com/alt.jpg')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips status via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw.status).toBe('active')
    expect(raw.title).toBe('Camiseta Básica')
  })

  it('round-trips variant via untransformVariant', () => {
    const variant = transformVariant(makeVariant())
    const raw = untransformVariant(variant)
    expect(raw.sku).toBe('CAM-P-PRETA')
    expect(raw.weight).toBe(0.3)
  })
})
