import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  transformProduct,
  type RawSkioProductVariant,
  type RawSkioProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/skio/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawSkioProductVariant> = {}): RawSkioProductVariant {
  return {
    id: 'var-001',
    platformId: 'gid://shopify/ProductVariant/111',
    title: 'Large / Blue',
    price: '49.99',
    sku: 'TEE-L-BLUE',
    product: { id: 'prod-001' },
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-05-20T12:00:00Z',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawSkioProduct> = {}): RawSkioProduct {
  return {
    id: 'prod-001',
    platformId: 'gid://shopify/Product/987654321',
    title: 'Ocean Blue T-Shirt',
    status: 'ACTIVE',
    slug: 'ocean-blue-t-shirt',
    imageSrc: 'https://cdn.example.com/tee.jpg',
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-05-20T12:00:00Z',
    site: { id: 'site-001', name: 'My Store' },
    ProductVariants: [makeVariant()],
    ...overrides,
  }
}

describe('transformVariant', () => {
  it('maps core variant fields', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('var-001')
    expect(result.sku).toBe('TEE-L-BLUE')
    expect(result.title).toBe('Large / Blue')
    expect(result.productId).toBe('prod-001')
  })

  it('converts price from major to minor units (USD)', () => {
    const result = transformVariant(makeVariant())
    // 49.99 USD → 4999 cents
    expect(result.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('handles numeric price', () => {
    const result = transformVariant(makeVariant({ price: 10 }))
    expect(result.price).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('returns zero price for null price', () => {
    const result = transformVariant(makeVariant({ price: null }))
    expect(result.price.amount).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    const result = transformVariant(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct', () => {
  it('maps core product fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-001')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps slug to handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('ocean-blue-t-shirt')
  })

  it('maps imageSrc to images array', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/tee.jpg')
    expect(result.images![0]!.alt).toBe('Ocean Blue T-Shirt')
  })

  it('maps ProductVariants to variants array', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('var-001')
    expect(result.variants![0]!.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps timestamps to ISO strings', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-10T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-20T12:00:00.000Z')
  })

  it('maps ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ status: 'archived' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps DRAFT status', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('returns undefined status for unknown status string', () => {
    const result = transformProduct(makeProduct({ status: 'unknown-state' }))
    expect(result.status).toBeUndefined()
  })

  it('returns undefined handle when slug is null', () => {
    const result = transformProduct(makeProduct({ slug: null }))
    expect(result.handle).toBeUndefined()
  })

  it('returns undefined images when imageSrc is null', () => {
    const result = transformProduct(makeProduct({ imageSrc: null, ProductVariants: [] }))
    expect(result.images).toBeUndefined()
  })

  it('returns undefined variants when ProductVariants is empty', () => {
    const result = transformProduct(makeProduct({ ProductVariants: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
