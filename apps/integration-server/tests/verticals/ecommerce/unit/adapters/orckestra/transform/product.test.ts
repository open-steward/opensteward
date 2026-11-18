import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  pickString,
  type RawOrckestraProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/orckestra/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawOrckestraProduct> = {}): RawOrckestraProduct {
  return {
    Id: 'prod-001',
    DisplayName: 'Orckestra Widget',
    Description: 'A high-quality composable widget.',
    ListPrice: 49.99,
    CurrentPrice: 39.99,
    Sku: 'OW-001',
    IsActive: true,
    PrimaryParentCategoryId: 'cat-electronics',
    Currency: 'USD',
    ImageUrl: 'https://cdn.example.com/widget.jpg',
    CreatedDate: '2024-01-15T08:00:00Z',
    LastModifiedDate: '2024-06-01T12:00:00Z',
    PropertyBag: { color: 'blue', weight: '0.5kg' },
    ...overrides,
  }
}

describe('pickString', () => {
  it('returns empty string for null/undefined', () => {
    expect(pickString(undefined)).toBe('')
    expect(pickString(null)).toBe('')
  })

  it('returns plain string as-is', () => {
    expect(pickString('Hello')).toBe('Hello')
  })

  it('picks en-US locale from a locale map', () => {
    expect(pickString({ 'en-US': 'Widget', 'fr-FR': 'Gadget' })).toBe('Widget')
  })

  it('falls back to first value when requested locale is absent', () => {
    expect(pickString({ 'de-DE': 'Gadget' }, 'en-US')).toBe('Gadget')
  })

  it('returns empty string for an empty locale map', () => {
    expect(pickString({})).toBe('')
  })
})

describe('transformProduct', () => {
  it('passes canonical Product schema validation', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps Id to id', () => {
    const result = transformProduct(makeProduct({ Id: 'abc-123' }))
    expect(result.id).toBe('abc-123')
  })

  it('maps DisplayName to title', () => {
    const result = transformProduct(makeProduct({ DisplayName: 'My Product' }))
    expect(result.title).toBe('My Product')
  })

  it('maps localized DisplayName to title', () => {
    const result = transformProduct(
      makeProduct({ DisplayName: { 'en-US': 'Widget EN', 'fr-FR': 'Widget FR' } }),
    )
    expect(result.title).toBe('Widget EN')
  })

  it('maps Description to description', () => {
    const result = transformProduct(makeProduct({ Description: 'A fine product.' }))
    expect(result.description).toBe('A fine product.')
  })

  it('sets status to ACTIVE when IsActive is true', () => {
    const result = transformProduct(makeProduct({ IsActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('sets status to DRAFT when IsActive is false', () => {
    const result = transformProduct(makeProduct({ IsActive: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('defaults status to ACTIVE when IsActive is undefined', () => {
    const result = transformProduct(makeProduct({ IsActive: undefined }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps PrimaryParentCategoryId to productType', () => {
    const result = transformProduct(makeProduct({ PrimaryParentCategoryId: 'cat-widgets' }))
    expect(result.productType).toBe('cat-widgets')
  })

  it('maps ImageUrl to images array', () => {
    const result = transformProduct(makeProduct({ ImageUrl: 'https://cdn.example.com/img.jpg' }))
    expect(result.images).toHaveLength(1)
    expect(result.images![0].url).toBe('https://cdn.example.com/img.jpg')
  })

  it('omits images when ImageUrl is null', () => {
    const result = transformProduct(makeProduct({ ImageUrl: null }))
    expect(result.images).toBeUndefined()
  })

  it('maps CreatedDate to createdAt', () => {
    const result = transformProduct(makeProduct({ CreatedDate: '2024-01-15T08:00:00Z' }))
    expect(result.createdAt).toBe('2024-01-15T08:00:00Z')
  })

  it('maps LastModifiedDate to updatedAt', () => {
    const result = transformProduct(makeProduct({ LastModifiedDate: '2024-06-01T12:00:00Z' }))
    expect(result.updatedAt).toBe('2024-06-01T12:00:00Z')
  })

  it('carries full raw object in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect((result.metadata as Record<string, unknown>)['raw']).toEqual(raw)
  })

  it('synthesises exactly one variant', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
  })

  it('variant id is productId with -v1 suffix', () => {
    const result = transformProduct(makeProduct({ Id: 'prod-xyz' }))
    expect(result.variants![0].id).toBe('prod-xyz-v1')
  })

  it('variant price uses CurrentPrice', () => {
    const result = transformProduct(makeProduct({ CurrentPrice: 39.99, Currency: 'USD' }))
    expect(result.variants![0].price).toEqual({ amount: 3999, currency: 'USD' })
  })

  it('variant compareAtPrice uses ListPrice', () => {
    const result = transformProduct(makeProduct({ ListPrice: 49.99, Currency: 'USD' }))
    expect(result.variants![0].compareAtPrice).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('variant compareAtPrice is undefined when ListPrice is null', () => {
    const result = transformProduct(makeProduct({ ListPrice: null }))
    expect(result.variants![0].compareAtPrice).toBeUndefined()
  })

  it('variant sku maps from Sku field', () => {
    const result = transformProduct(makeProduct({ Sku: 'SKU-999' }))
    expect(result.variants![0].sku).toBe('SKU-999')
  })

  it('variant passes canonical ProductVariant schema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductVariantSchema.parse(result.variants![0])).not.toThrow()
  })

  it('uses product Id as title fallback when DisplayName is missing', () => {
    const result = transformProduct(makeProduct({ DisplayName: undefined, Id: 'fallback-id' }))
    expect(result.title).toBe('fallback-id')
  })

  it('variant defaults price amount to 0 when CurrentPrice is null', () => {
    const result = transformProduct(makeProduct({ CurrentPrice: null }))
    expect(result.variants![0].price.amount).toBe(0)
  })
})

describe('transformProductVariant', () => {
  it('passes canonical ProductVariant schema validation', () => {
    const result = transformProductVariant(makeProduct())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('sets productId from product Id', () => {
    const result = transformProductVariant(makeProduct({ Id: 'prod-999' }))
    expect(result.productId).toBe('prod-999')
  })

  it('variant metadata contains raw object', () => {
    const raw = makeProduct()
    const result = transformProductVariant(raw)
    expect((result.metadata as Record<string, unknown>)['raw']).toEqual(raw)
  })
})
