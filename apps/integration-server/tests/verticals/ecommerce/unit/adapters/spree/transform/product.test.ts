import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawSpreeProduct,
  type RawSpreeVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/spree/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSpreeProduct> = {}): RawSpreeProduct {
  return {
    id: 42,
    name: 'Spree T-Shirt',
    description: '<p>A comfortable cotton tee.</p>',
    slug: 'spree-t-shirt',
    status: 'active',
    price: '24.99',
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
          { id: 10, name: 'red', presentation: 'Red', option_type_name: 'color' },
          { id: 11, name: 'blue', presentation: 'Blue', option_type_name: 'color' },
        ],
      },
      {
        id: 2,
        name: 'size',
        presentation: 'Size',
        position: 1,
        option_values: [
          { id: 20, name: 's', presentation: 'S', option_type_name: 'size' },
          { id: 21, name: 'm', presentation: 'M', option_type_name: 'size' },
        ],
      },
    ],
    images: [
      {
        id: 100,
        position: 0,
        alt: 'Front view',
        original_url: 'https://cdn.example.com/tshirt-front.jpg',
      },
    ],
    ...overrides,
  }
}

function makeVariant(overrides: Partial<RawSpreeVariant> = {}): RawSpreeVariant {
  return {
    id: 101,
    sku: 'TSH-RED-S',
    price: '24.99',
    compare_at_price: '29.99',
    currency: 'USD',
    weight: '200',
    is_master: false,
    position: 1,
    product_id: 42,
    track_inventory: true,
    tax_category_id: 1,
    barcode: '1234567890123',
    option_values: [
      { id: 10, name: 'red', presentation: 'Red', option_type_name: 'color' },
      { id: 20, name: 's', presentation: 'S', option_type_name: 'size' },
    ],
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-02-15T08:30:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (Spree)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Spree T-Shirt')
    expect(result.description).toBe('<p>A comfortable cotton tee.</p>')
    expect(result.handle).toBe('spree-t-shirt')
    expect(result.status).toBe('ACTIVE')
    expect(result.publishedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('builds options from option_types', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({
      name: 'Color',
      values: ['Red', 'Blue'],
    })
    expect(result.options![1]!.name).toBe('Size')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]).toMatchObject({
      id: '100',
      url: 'https://cdn.example.com/tshirt-front.jpg',
      alt: 'Front view',
      position: 0,
    })
  })

  it('maps non-master variants', () => {
    const variants: RawSpreeVariant[] = [
      makeVariant({ id: 100, is_master: true, sku: 'TSH-MASTER' }),
      makeVariant({ id: 101, is_master: false, sku: 'TSH-RED-S' }),
    ]
    const result = transformProduct(makeProduct({ variants }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('101')
    expect(result.variants![0]!.sku).toBe('TSH-RED-S')
  })

  it('synthesises default variant when no non-master variants exist', () => {
    const result = transformProduct(makeProduct({ variants: [] }))
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('uses master variant for default when available', () => {
    const master: RawSpreeVariant = makeVariant({ id: 99, is_master: true, sku: 'TSH-MASTER', price: '19.99' })
    const result = transformProduct(makeProduct({ variants: [master] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('99')
    expect(result.variants![0]!.price).toEqual({ amount: 1999, currency: 'USD' })
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

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical) as { product: Record<string, unknown> }
    expect(body.product['name']).toBe('Spree T-Shirt')
    expect(body.product['slug']).toBe('spree-t-shirt')
    expect(body.product['status']).toBe('active')
  })
})

describe('transformProductVariant (Spree) standalone', () => {
  it('maps core variant fields', () => {
    const v = transformProductVariant(makeVariant(), '42')
    expect(v.id).toBe('101')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('TSH-RED-S')
    expect(v.barcode).toBe('1234567890123')
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2999, currency: 'USD' })
    expect(v.weight).toBe(200)
    expect(v.weightUnit).toBe('g')
  })

  it('builds optionValues from option_values', () => {
    const v = transformProductVariant(makeVariant())
    expect(v.optionValues).toEqual({ color: 'Red', size: 'S' })
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
    expect(body.variant['sku']).toBe('TSH-RED-S')
    expect(body.variant['price']).toBe(2499)
  })
})
