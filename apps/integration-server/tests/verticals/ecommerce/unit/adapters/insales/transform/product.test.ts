import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawInsalesProduct,
  type RawInsalesVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/insales/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawInsalesVariant> = {}): RawInsalesVariant {
  return {
    id: 8001,
    product_id: 42,
    title: 'M / Синий',
    sku: 'TEE-BLU-M',
    price: '1499.00',
    old_price: '1999.00',
    quantity: 25,
    weight: '0.3',
    option_values: [
      { id: 101, option_name_id: 1, title: 'M', position: 1 },
      { id: 201, option_name_id: 2, title: 'Синий', position: 1 },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawInsalesProduct> = {}): RawInsalesProduct {
  return {
    id: 42,
    title: 'Классическая футболка',
    description: '<p>Удобная футболка на каждый день</p>',
    permalink: 'klassicheskaya-futbolka',
    category_id: 7,
    is_hidden: false,
    tags: 'лето, casual',
    vendor: 'BasicCo',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    images: [
      {
        id: 301,
        url: 'https://cdn.example.com/tee.jpg',
        original_url: 'https://cdn.example.com/tee-orig.jpg',
        alt: 'Футболка',
        position: 1,
        width: 800,
        height: 1000,
      },
    ],
    variants: [makeVariant()],
    option_names: [
      { id: 1, title: 'Размер', position: 1, option_values: [{ id: 101, title: 'M' }] },
      {
        id: 2,
        title: 'Цвет',
        position: 2,
        option_values: [{ id: 201, title: 'Синий' }],
      },
    ],
    ...overrides,
  }
}

describe('transformVariant (insales)', () => {
  it('maps id and productId as strings', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('8001')
    expect(result.productId).toBe('42')
  })

  it('maps sku and title', () => {
    const result = transformVariant(makeVariant())
    expect(result.sku).toBe('TEE-BLU-M')
    expect(result.title).toBe('M / Синий')
  })

  it('maps price in minor units', () => {
    const result = transformVariant(makeVariant())
    // 1499.00 RUB → 149900 minor units
    expect(result.price).toEqual({ amount: 149900, currency: 'RUB' })
  })

  it('maps compareAtPrice from old_price in minor units', () => {
    const result = transformVariant(makeVariant())
    // 1999.00 RUB → 199900
    expect(result.compareAtPrice).toEqual({ amount: 199900, currency: 'RUB' })
  })

  it('omits compareAtPrice when old_price is 0 or null', () => {
    const result = transformVariant(makeVariant({ old_price: null }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps weight', () => {
    const result = transformVariant(makeVariant())
    expect(result.weight).toBeCloseTo(0.3)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    const result = transformVariant(raw)
    expect(result.metadata).toBe(raw)
  })
})

describe('transformProduct (insales)', () => {
  it('maps id as string and title', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Классическая футболка')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>Удобная футболка на каждый день</p>')
  })

  it('maps handle from permalink', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('klassicheskaya-futbolka')
  })

  it('maps status ACTIVE when is_hidden=false', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status DRAFT when is_hidden=true', () => {
    const result = transformProduct(makeProduct({ is_hidden: true }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps vendor', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('BasicCo')
  })

  it('parses tags from comma-separated string', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['лето', 'casual'])
  })

  it('maps options from option_names', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    const sizeOpt = result.options!.find((o) => o.name === 'Размер')
    expect(sizeOpt?.values).toContain('M')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/tee.jpg')
    expect(result.images![0]!.alt).toBe('Футболка')
  })

  it('maps variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('8001')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['title']).toBe('Классическая футболка')
    expect(body['is_hidden']).toBe(false)
    expect(body['tags']).toBe('лето, casual')
  })

  it('round-trips variant via untransformVariant', () => {
    const canonical = transformVariant(makeVariant())
    const body = untransformVariant(canonical)
    expect(body['sku']).toBe('TEE-BLU-M')
    // price: 149900 minor units → 1499 major RUB
    expect(body['price']).toBeCloseTo(1499, 1)
  })
})
