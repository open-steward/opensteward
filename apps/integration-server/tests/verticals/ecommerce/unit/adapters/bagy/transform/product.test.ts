import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawBagyProduct,
  type RawBagyVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagy/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawBagyVariant> = {}): RawBagyVariant {
  return {
    id: 501,
    product_id: 100,
    reference: 'CAMISA-G',
    ean: '7891234567890',
    price: '89.90',
    promotional_price: '79.90',
    stock: 10,
    weight: 0.3,
    order: 0,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawBagyProduct> = {}): RawBagyProduct {
  return {
    id: 100,
    name: 'Camiseta Polo',
    description: 'Camiseta polo confortável',
    slug: 'camiseta-polo',
    available: 1,
    brand: 'AcmeBR',
    price: '89.90',
    promotional_price: '79.90',
    created: '2024-03-01T00:00:00Z',
    modified: '2024-06-01T00:00:00Z',
    Variant: [makeVariant()],
    ProductImage: [{ id: 1, https: 'https://cdn.example.com/camiseta.jpg' }],
    ...overrides,
  }
}

describe('transformVariant (Bagy)', () => {
  it('maps id to string', () => {
    const result = transformVariant(makeVariant({ id: 501 }))
    expect(result.id).toBe('501')
  })

  it('maps productId from product_id', () => {
    const result = transformVariant(makeVariant({ product_id: 100 }))
    expect(result.productId).toBe('100')
  })

  it('maps sku from reference', () => {
    const result = transformVariant(makeVariant())
    expect(result.sku).toBe('CAMISA-G')
  })

  it('maps barcode from ean', () => {
    const result = transformVariant(makeVariant())
    expect(result.barcode).toBe('7891234567890')
  })

  it('converts price to minor units (BRL)', () => {
    const result = transformVariant(makeVariant({ price: '89.90' }))
    expect(result.price.amount).toBe(8990)
    expect(result.price.currency).toBe('BRL')
  })

  it('maps compareAtPrice from promotional_price when non-zero', () => {
    const result = transformVariant(makeVariant({ price: '89.90', promotional_price: '79.90' }))
    expect(result.compareAtPrice?.amount).toBe(7990)
  })

  it('returns no compareAtPrice when promotional_price is 0', () => {
    const result = transformVariant(makeVariant({ promotional_price: 0 }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('hardcodes weightUnit to kg', () => {
    const result = transformVariant(makeVariant())
    expect(result.weightUnit).toBe('kg')
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct (Bagy)', () => {
  it('maps id to string', () => {
    const result = transformProduct(makeProduct({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('maps name to title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Camiseta Polo')
  })

  it('maps slug to handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('camiseta-polo')
  })

  it('maps available=1 to ACTIVE', () => {
    const result = transformProduct(makeProduct({ available: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps available=0 to DRAFT', () => {
    const result = transformProduct(makeProduct({ available: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('Camiseta polo confortável')
  })

  it('maps brand to vendor', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('AcmeBR')
  })

  it('maps nested Variant array to variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('501')
  })

  it('synthesises a default variant when Variant array is empty', () => {
    const result = transformProduct(makeProduct({ Variant: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('100-default')
  })

  it('maps ProductImage https url to images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/camiseta.jpg')
  })

  it('stores raw in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Bagy)', () => {
  it('maps title to name', () => {
    const body = untransformProduct({ title: 'New Shirt' })
    expect(body.name).toBe('New Shirt')
  })

  it('maps ACTIVE status to available=1', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body.available).toBe(1)
  })

  it('maps DRAFT status to available=0', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body.available).toBe(0)
  })

  it('converts variant price from minor to major units string', () => {
    const body = untransformProduct({
      variants: [{ id: 'v1', price: { amount: 8990, currency: 'BRL' }, metadata: {} }],
    })
    expect(body.price).toBe('89.90')
  })
})

describe('untransformVariant (Bagy)', () => {
  it('maps sku to reference', () => {
    const body = untransformVariant({ sku: 'SKU-001' })
    expect(body.reference).toBe('SKU-001')
  })

  it('converts price from minor to major units string', () => {
    const body = untransformVariant({ price: { amount: 8990, currency: 'BRL' } })
    expect(body.price).toBe('89.90')
  })
})
