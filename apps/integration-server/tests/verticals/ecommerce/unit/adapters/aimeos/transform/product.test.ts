import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type AimeosProduct,
  type AimeosPrice,
  type AimeosMedia,
} from '../../../../../../../src/verticals/ecommerce/adapters/aimeos/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePrice(overrides: Partial<AimeosPrice['attributes']> = {}): AimeosPrice {
  return {
    type: 'price',
    id: 'price-001',
    attributes: {
      'price.value': '29.99',
      'price.currencyid': 'EUR',
      'price.quantity': 1,
      'price.domain': 'product',
      ...overrides,
    },
  }
}

function makeMedia(overrides: Partial<AimeosMedia['attributes']> = {}): AimeosMedia {
  return {
    type: 'media',
    id: 'media-001',
    attributes: {
      'media.url': 'https://myshop.example.com/images/t-shirt.jpg',
      'media.label': 'Blue T-Shirt front view',
      'media.width': 800,
      'media.height': 600,
      'media.position': 0,
      'media.domain': 'product',
      ...overrides,
    },
  }
}

function makeProduct(overrides: Partial<AimeosProduct['attributes']> = {}): AimeosProduct {
  return {
    type: 'product',
    id: 'prod-001',
    attributes: {
      'product.id': 'prod-001',
      'product.label': 'Blue T-Shirt',
      'product.code': 'TSHIRT-BLU',
      'product.status': 1,
      'product.type': 'default',
      'product.url': 'blue-t-shirt',
      'product.description': 'A comfortable blue t-shirt.',
      'product.ctime': '2024-06-01T00:00:00+00:00',
      'product.mtime': '2024-06-02T00:00:00+00:00',
      ...overrides,
    },
    relationships: {
      'product/price': {
        data: [{ type: 'price', id: 'price-001' }],
      },
    },
  }
}

// ── transformVariant ──────────────────────────────────────────────────────────

describe('transformVariant (Aimeos)', () => {
  it('maps core variant fields from product resource', () => {
    const raw = makeProduct()
    const result = transformVariant(raw, makePrice(), 'parent-001')
    expect(result.id).toBe('prod-001')
    expect(result.sku).toBe('TSHIRT-BLU')
    expect(result.title).toBe('Blue T-Shirt')
    expect(result.productId).toBe('parent-001')
  })

  it('maps price from included price resource', () => {
    const raw = makeProduct()
    const result = transformVariant(raw, makePrice())
    expect(result.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('falls back to zero price when no price resource provided', () => {
    const raw = makeProduct()
    const result = transformVariant(raw)
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('sets requiresShipping and taxable defaults', () => {
    const result = transformVariant(makeProduct())
    expect(result.requiresShipping).toBe(true)
    expect(result.taxable).toBe(true)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformVariant(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles zero price value', () => {
    const result = transformVariant(makeProduct(), makePrice({ 'price.value': '0' }))
    expect(result.price).toEqual({ amount: 0, currency: 'EUR' })
  })

  it('handles numeric price value', () => {
    const result = transformVariant(makeProduct(), makePrice({ 'price.value': 49.95 }))
    expect(result.price.amount).toBeCloseTo(4995)
  })

  it('handles undefined productId', () => {
    const result = transformVariant(makeProduct())
    expect(result.productId).toBeUndefined()
  })

  it('handles missing sku gracefully', () => {
    const raw = makeProduct({ 'product.code': undefined })
    const result = transformVariant(raw)
    expect(result.sku).toBeUndefined()
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeProduct(), makePrice(), 'parent-001')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

// ── transformProduct ──────────────────────────────────────────────────────────

describe('transformProduct (Aimeos)', () => {
  it('maps core product fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-001')
    expect(result.title).toBe('Blue T-Shirt')
    expect(result.description).toBe('A comfortable blue t-shirt.')
    expect(result.handle).toBe('blue-t-shirt')
    expect(result.productType).toBe('default')
  })

  it('maps status=1 to ACTIVE', () => {
    const result = transformProduct(makeProduct({ 'product.status': 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status=0 to DRAFT', () => {
    const result = transformProduct(makeProduct({ 'product.status': 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status=-2 to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ 'product.status': -2 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps status=-1 (review) to DRAFT', () => {
    const result = transformProduct(makeProduct({ 'product.status': -1 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-06-01T00:00:00+00:00')
    expect(result.updatedAt).toBe('2024-06-02T00:00:00+00:00')
  })

  it('maps included media to images', () => {
    const media = makeMedia()
    const result = transformProduct(makeProduct(), undefined, [media])
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://myshop.example.com/images/t-shirt.jpg')
    expect(result.images![0]!.alt).toBe('Blue T-Shirt front view')
    expect(result.images![0]!.width).toBe(800)
  })

  it('synthesises variant stubs from relationship IDs when no included variants', () => {
    const raw = makeProduct()
    raw.relationships!['product/product'] = {
      data: [{ type: 'product', id: 'variant-001' }],
    }
    const result = transformProduct(raw)
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('variant-001')
    expect(result.variants![0]!.productId).toBe('prod-001')
  })

  it('uses included variants when provided', () => {
    const variantRaw = makeProduct({
      'product.label': 'Blue T-Shirt - Red',
      'product.code': 'TSHIRT-RED',
    })
    variantRaw.id = 'variant-red'
    const result = transformProduct(makeProduct(), undefined, undefined, [variantRaw])
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('variant-red')
    expect(result.variants![0]!.sku).toBe('TSHIRT-RED')
  })

  it('handles product with no variants relationship', () => {
    const raw = makeProduct()
    raw.relationships = {}
    const result = transformProduct(raw)
    expect(result.variants).toBeUndefined()
  })

  it('handles missing title gracefully', () => {
    const result = transformProduct(makeProduct({ 'product.label': undefined }))
    expect(result.title).toBe('')
  })

  it('handles missing description', () => {
    const result = transformProduct(makeProduct({ 'product.description': undefined }))
    expect(result.description).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct(), [makePrice()], [makeMedia()])
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

// ── untransformProduct ────────────────────────────────────────────────────────

describe('untransformProduct (Aimeos)', () => {
  it('produces JSON:API body with correct resource type', () => {
    const body = untransformProduct({ title: 'New Shirt' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('product')
    expect(body.data.attributes['product.label']).toBe('New Shirt')
  })

  it('maps ACTIVE status to 1', () => {
    const body = untransformProduct({ status: 'ACTIVE' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['product.status']).toBe(1)
  })

  it('maps DRAFT status to 0', () => {
    const body = untransformProduct({ status: 'DRAFT' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['product.status']).toBe(0)
  })

  it('maps ARCHIVED status to -2', () => {
    const body = untransformProduct({ status: 'ARCHIVED' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['product.status']).toBe(-2)
  })

  it('maps handle to product.url', () => {
    const body = untransformProduct({ handle: 'my-slug' }) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['product.url']).toBe('my-slug')
  })

  it('omits undefined fields', () => {
    const body = untransformProduct({}) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['product.label']).toBeUndefined()
    expect(body.data.attributes['product.status']).toBeUndefined()
  })
})
