import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawSolidusProduct,
  type RawSolidusVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/solidus/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSolidusProduct> = {}): RawSolidusProduct {
  return {
    id: 42,
    name: 'Solidus Hoodie',
    description: '<p>Premium cotton hoodie.</p>',
    slug: 'solidus-hoodie',
    status: 'active',
    price: '59.99',
    currency: 'USD',
    available_on: '2024-01-01T00:00:00.000Z',
    discontinue_on: null,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-02-15T08:30:00.000Z',
    option_types: [
      {
        id: 1,
        name: 'color',
        presentation: 'Color',
        position: 0,
        option_values: [
          { id: 10, name: 'black', presentation: 'Black', option_type_name: 'color' },
          { id: 11, name: 'grey', presentation: 'Grey', option_type_name: 'color' },
        ],
      },
      {
        id: 2,
        name: 'size',
        presentation: 'Size',
        position: 1,
        option_values: [
          { id: 20, name: 's', presentation: 'S', option_type_name: 'size' },
          { id: 21, name: 'l', presentation: 'L', option_type_name: 'size' },
        ],
      },
    ],
    images: [
      {
        id: 100,
        position: 0,
        alt: 'Front view',
        original_url: 'https://cdn.example.com/hoodie-front.jpg',
      },
    ],
    ...overrides,
  }
}

function makeVariant(overrides: Partial<RawSolidusVariant> = {}): RawSolidusVariant {
  return {
    id: 101,
    sku: 'HOO-BLK-S',
    price: '59.99',
    compare_at_price: '69.99',
    currency: 'USD',
    weight: '400',
    is_master: false,
    position: 1,
    product_id: 42,
    track_inventory: true,
    tax_category_id: 1,
    barcode: '9876543210123',
    option_values: [
      { id: 10, name: 'black', presentation: 'Black', option_type_name: 'color' },
      { id: 20, name: 's', presentation: 'S', option_type_name: 'size' },
    ],
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-02-15T08:30:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (Solidus)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Solidus Hoodie')
    expect(result.description).toBe('<p>Premium cotton hoodie.</p>')
    expect(result.handle).toBe('solidus-hoodie')
    expect(result.status).toBe('ACTIVE')
    expect(result.publishedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('builds options from option_types', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({
      name: 'Color',
      values: ['Black', 'Grey'],
    })
    expect(result.options![1]!.name).toBe('Size')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]).toMatchObject({
      id: '100',
      url: 'https://cdn.example.com/hoodie-front.jpg',
      alt: 'Front view',
      position: 0,
    })
  })

  it('maps non-master variants', () => {
    const variants: RawSolidusVariant[] = [
      makeVariant({ id: 100, is_master: true, sku: 'HOO-MASTER' }),
      makeVariant({ id: 101, is_master: false, sku: 'HOO-BLK-S' }),
    ]
    const result = transformProduct(makeProduct({ variants }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('101')
    expect(result.variants![0]!.sku).toBe('HOO-BLK-S')
  })

  it('synthesises default variant when no non-master variants exist', () => {
    const result = transformProduct(makeProduct({ variants: [] }))
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.price).toEqual({ amount: 5999, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('uses master variant for default when available', () => {
    const master: RawSolidusVariant = makeVariant({
      id: 99,
      is_master: true,
      sku: 'HOO-MASTER',
      price: '49.99',
    })
    const result = transformProduct(makeProduct({ variants: [master] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('99')
    expect(result.variants![0]!.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('preserves the raw payload in metadata unmodified', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const variants = [makeVariant()]
    const result = transformProduct(makeProduct({ variants }))
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps draft status', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps archived status', () => {
    const result = transformProduct(makeProduct({ status: 'archived' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('infers ACTIVE from available_on when status is absent', () => {
    const result = transformProduct(
      makeProduct({ status: undefined, available_on: '2024-01-01T00:00:00.000Z' }),
    )
    expect(result.status).toBe('ACTIVE')
  })

  it('infers DRAFT when both status and available_on are absent', () => {
    const result = transformProduct(
      makeProduct({ status: undefined, available_on: null }),
    )
    expect(result.status).toBe('DRAFT')
  })

  it('uses make_active_at as publishedAt fallback', () => {
    const result = transformProduct(
      makeProduct({ available_on: null, make_active_at: '2024-06-01T00:00:00.000Z' }),
    )
    expect(result.publishedAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('prefers available_on over make_active_at for publishedAt', () => {
    const result = transformProduct(
      makeProduct({
        available_on: '2024-01-01T00:00:00.000Z',
        make_active_at: '2024-06-01T00:00:00.000Z',
      }),
    )
    expect(result.publishedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical) as { product: Record<string, unknown> }
    expect(body.product['name']).toBe('Solidus Hoodie')
    expect(body.product['slug']).toBe('solidus-hoodie')
    expect(body.product['status']).toBe('active')
  })
})

describe('transformProductVariant (Solidus) standalone', () => {
  it('maps core variant fields', () => {
    const v = transformProductVariant(makeVariant(), '42')
    expect(v.id).toBe('101')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('HOO-BLK-S')
    expect(v.barcode).toBe('9876543210123')
    expect(v.price).toEqual({ amount: 5999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 6999, currency: 'USD' })
    expect(v.weight).toBe(400)
    expect(v.weightUnit).toBe('g')
  })

  it('builds optionValues from option_values', () => {
    const v = transformProductVariant(makeVariant())
    expect(v.optionValues).toEqual({ color: 'Black', size: 'S' })
  })

  it('marks taxable when tax_category_id present', () => {
    const v = transformProductVariant(makeVariant({ tax_category_id: 5 }))
    expect(v.taxable).toBe(true)
  })

  it('marks not taxable when no tax_category_id', () => {
    const v = transformProductVariant(makeVariant({ tax_category_id: null }))
    expect(v.taxable).toBe(false)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const v = transformProductVariant(makeVariant(), '42')
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('round-trips writable fields via untransformProductVariant', () => {
    const canonical = transformProductVariant(makeVariant(), '42')
    const body = untransformProductVariant(canonical) as { variant: Record<string, unknown> }
    expect(body.variant['sku']).toBe('HOO-BLK-S')
    expect(body.variant['price']).toBe(5999)
  })
})
