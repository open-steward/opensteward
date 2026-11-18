import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawDoocaProduct,
  type RawDoocaVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(overrides: Partial<RawDoocaVariation> = {}): RawDoocaVariation {
  return {
    id: 11,
    product_id: 3,
    reference: 'TSHIRT-BLU-M',
    gtin: '1234567890123',
    price: '29.99',
    price_compare: '39.99',
    stock: 50,
    weight: 200,
    active: true,
    position: 1,
    grids: [{ id: 1, name: 'Color', value: 'Blue' }],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawDoocaProduct> = {}): RawDoocaProduct {
  return {
    id: 3,
    name: 'Blue T-Shirt',
    description: '<p>A great shirt</p>',
    slug: 'blue-t-shirt',
    active: true,
    price: '29.99',
    brand: { id: 1, name: 'Shirt Co' },
    category_default: { id: 2, name: 'Apparel' },
    images: [{ id: 10, url: 'https://example.com/shirt.jpg', title: 'Front', position: 0 }],
    variations: [makeVariation()],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformVariant (Dooca Commerce)', () => {
  it('maps id as string', () => {
    const result = transformVariant(makeVariation({ id: 11 }))
    expect(result.id).toBe('11')
  })

  it('maps productId as string', () => {
    const result = transformVariant(makeVariation())
    expect(result.productId).toBe('3')
  })

  it('maps sku from reference', () => {
    const result = transformVariant(makeVariation())
    expect(result.sku).toBe('TSHIRT-BLU-M')
  })

  it('maps barcode from gtin', () => {
    const result = transformVariant(makeVariation())
    expect(result.barcode).toBe('1234567890123')
  })

  it('converts price from BRL major to minor units', () => {
    const result = transformVariant(makeVariation({ price: '29.99' }))
    expect(result.price).toEqual({ amount: 2999, currency: 'BRL' })
  })

  it('converts compareAtPrice from BRL major to minor units', () => {
    const result = transformVariant(makeVariation({ price_compare: '39.99' }))
    expect(result.compareAtPrice).toEqual({ amount: 3999, currency: 'BRL' })
  })

  it('omits compareAtPrice when price_compare is null', () => {
    const result = transformVariant(makeVariation({ price_compare: null }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps weight', () => {
    const result = transformVariant(makeVariation({ weight: 200 }))
    expect(result.weight).toBe(200)
  })

  it('sets weightUnit to "g"', () => {
    const result = transformVariant(makeVariation())
    expect(result.weightUnit).toBe('g')
  })

  it('builds optionValues from grids', () => {
    const result = transformVariant(makeVariation())
    expect(result.optionValues).toEqual({ Color: 'Blue' })
  })

  it('uses custom currency when provided', () => {
    const result = transformVariant(makeVariation({ price: '10.00' }), 'USD')
    expect(result.price).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariation())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct (Dooca Commerce)', () => {
  it('maps id as string', () => {
    const result = transformProduct(makeProduct({ id: 3 }))
    expect(result.id).toBe('3')
  })

  it('maps name to title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Blue T-Shirt')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>A great shirt</p>')
  })

  it('maps slug to handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('blue-t-shirt')
  })

  it('maps active=true to ACTIVE status', () => {
    const result = transformProduct(makeProduct({ active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active=false to DRAFT status', () => {
    const result = transformProduct(makeProduct({ active: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps brand name to vendor', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('Shirt Co')
  })

  it('maps category name to productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Apparel')
  })

  it('maps images with url and alt', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://example.com/shirt.jpg')
    expect(result.images![0]!.alt).toBe('Front')
  })

  it('maps nested variations to variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('11')
    expect(result.variants![0]!.sku).toBe('TSHIRT-BLU-M')
  })

  it('returns undefined variants when variations array is empty', () => {
    const result = transformProduct(makeProduct({ variations: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Dooca Commerce)', () => {
  it('maps title to name', () => {
    const body = untransformProduct({ title: 'New Shirt' })
    expect(body['name']).toBe('New Shirt')
  })

  it('maps ACTIVE status to active=true', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body['active']).toBe(true)
  })

  it('maps DRAFT status to active=false', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['active']).toBe(false)
  })

  it('maps handle to url', () => {
    const body = untransformProduct({ handle: 'new-shirt' })
    expect(body['url']).toBe('new-shirt')
  })
})

describe('untransformVariant (Dooca Commerce)', () => {
  it('maps sku to reference', () => {
    const body = untransformVariant({ sku: 'SKU-001' })
    expect(body['reference']).toBe('SKU-001')
  })

  it('converts minor unit price back to BRL major units string', () => {
    const body = untransformVariant({ price: { amount: 2999, currency: 'BRL' } })
    expect(body['price']).toBe('29.99')
  })

  it('maps weight', () => {
    const body = untransformVariant({ weight: 150 })
    expect(body['weight']).toBe(150)
  })
})
