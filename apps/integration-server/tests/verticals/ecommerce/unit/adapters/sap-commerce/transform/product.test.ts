import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  buildPatchForProduct,
  type RawSapProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSapProduct> = {}): RawSapProduct {
  return {
    code: 'HW-1234',
    name: 'SAP Enterprise Laptop',
    summary: 'High performance business laptop',
    description: '<p>Enterprise-grade laptop for SAP professionals</p>',
    url: '/products/HW-1234',
    manufacturer: 'Lenovo',
    productType: 'electronics',
    purchasable: true,
    price: {
      currencyIso: 'EUR',
      value: 1499.99,
      formattedValue: '1,499.99 EUR',
    },
    images: [
      { url: 'https://cdn.example/laptop-front.jpg', altText: 'Front view', format: 'product', imageType: 'PRIMARY', galleryIndex: 0 },
      { url: 'https://cdn.example/laptop-thumb.jpg', altText: 'Thumbnail', format: 'thumbnail', imageType: 'PRIMARY', galleryIndex: 0 },
      { url: 'https://cdn.example/laptop-side.jpg', altText: 'Side view', format: 'product', imageType: 'GALLERY', galleryIndex: 1 },
    ],
    categories: [
      { code: 'laptops', name: 'Laptops' },
      { code: 'electronics', name: 'Electronics' },
    ],
    stock: { stockLevel: 42, stockLevelStatus: 'inStock' },
    variantOptions: [
      {
        code: 'HW-1234-BLK',
        priceData: { currencyIso: 'EUR', value: 1499.99 },
        stock: { stockLevel: 20, stockLevelStatus: 'inStock' },
        variantOptionQualifiers: [
          { qualifier: 'color', name: 'Color', value: 'Black' },
        ],
      },
      {
        code: 'HW-1234-SLV',
        priceData: { currencyIso: 'EUR', value: 1549.99 },
        stock: { stockLevel: 22, stockLevelStatus: 'inStock' },
        variantOptionQualifiers: [
          { qualifier: 'color', name: 'Color', value: 'Silver' },
        ],
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-06-15T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (sap-commerce)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('HW-1234')
    expect(result.title).toBe('SAP Enterprise Laptop')
    expect(result.description).toBe('<p>Enterprise-grade laptop for SAP professionals</p>')
    expect(result.vendor).toBe('Lenovo')
    expect(result.productType).toBe('electronics')
  })

  it('extracts handle from url', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('products-hw-1234')
  })

  it('maps status based on purchasable flag', () => {
    expect(transformProduct(makeProduct()).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ purchasable: false })).status).toBe('ARCHIVED')
  })

  it('maps categories to tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['Laptops', 'Electronics'])
  })

  it('deduplicates images by galleryIndex preferring product format', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://cdn.example/laptop-front.jpg')
    expect(result.images![1]!.url).toBe('https://cdn.example/laptop-side.jpg')
  })

  it('maps variant options to options array', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('color')
    expect(result.options![0]!.values).toContain('Black')
    expect(result.options![0]!.values).toContain('Silver')
  })

  it('maps variant options to variants array', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]!.id).toBe('HW-1234-BLK')
    expect(result.variants![0]!.price.amount).toBe(149999)
    expect(result.variants![1]!.id).toBe('HW-1234-SLV')
    expect(result.variants![1]!.price.amount).toBe(154999)
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

  it('handles product with no variants', () => {
    const result = transformProduct(makeProduct({ variantOptions: undefined }))
    expect(result.variants).toBeUndefined()
    expect(result.options).toBeUndefined()
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
  })
})

describe('untransformProduct (sap-commerce)', () => {
  it('builds a creation body from canonical data', () => {
    const body = untransformProduct({
      id: 'NEW-001',
      title: 'New Product',
      description: 'A new product',
      vendor: 'TestVendor',
    }) as Record<string, unknown>
    expect(body['code']).toBe('NEW-001')
    expect(body['name']).toBe('New Product')
    expect(body['manufacturer']).toBe('TestVendor')
  })
})

describe('buildPatchForProduct (sap-commerce)', () => {
  it('includes only fields that are set', () => {
    const patch = buildPatchForProduct({ title: 'Updated Name' })
    expect(patch['name']).toBe('Updated Name')
    expect(patch).not.toHaveProperty('description')
    expect(patch).not.toHaveProperty('manufacturer')
  })

  it('includes all provided fields', () => {
    const patch = buildPatchForProduct({
      title: 'Updated',
      description: 'New desc',
      vendor: 'NewVendor',
    })
    expect(patch['name']).toBe('Updated')
    expect(patch['description']).toBe('New desc')
    expect(patch['manufacturer']).toBe('NewVendor')
  })
})
