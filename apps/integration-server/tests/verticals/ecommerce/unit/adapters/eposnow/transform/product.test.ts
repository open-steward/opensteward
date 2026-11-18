import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawEposNowProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawEposNowProduct> = {}): RawEposNowProduct {
  return {
    Id: 12345,
    Name: 'Flat White',
    Description: 'Smooth espresso with steamed milk',
    CategoryId: 10,
    CostPrice: 1.2,
    SalePrice: 3.5,
    Barcode: '5012345678901',
    Sku: 'FW-001',
    SellOnWeb: true,
    Archived: false,
    CreatedDate: '2024-01-15T10:30:00Z',
    LastUpdatedDate: '2024-03-20T14:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Epos Now)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('12345')
    expect(result.title).toBe('Flat White')
    expect(result.description).toBe('Smooth espresso with steamed milk')
    expect(result.status).toBe('ACTIVE')
  })

  it('creates a single variant from the product', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('12345')
    expect(v.sku).toBe('FW-001')
    expect(v.barcode).toBe('5012345678901')
    expect(v.price).toEqual({ amount: 350, currency: 'GBP' })
  })

  it('maps compareAtPrice from CostPrice', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 120, currency: 'GBP' })
  })

  it('falls back to Barcode if Sku is missing', () => {
    const result = transformProduct(makeProduct({ Sku: undefined }))
    expect(result.variants![0]!.sku).toBe('5012345678901')
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-15T10:30:00Z')
    expect(result.updatedAt).toBe('2024-03-20T14:00:00Z')
  })

  it('marks archived products as ARCHIVED', () => {
    const result = transformProduct(makeProduct({ Archived: true }))
    expect(result.status).toBe('ARCHIVED')
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

  it('handles missing optional fields gracefully', () => {
    const minimal: RawEposNowProduct = { Id: 99 }
    const result = transformProduct(minimal)
    expect(result.id).toBe('99')
    expect(result.title).toBe('')
    expect(result.status).toBe('ACTIVE')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Epos Now)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw['Name']).toBe('Flat White')
    expect(raw['Description']).toBe('Smooth espresso with steamed milk')
  })

  it('maps sale price back', () => {
    const raw = untransformProduct({
      title: 'Test',
      variants: [{ id: '1', price: { amount: 3.5, currency: 'GBP' }, metadata: {} }],
    })
    expect(raw['SalePrice']).toBe(3.5)
  })

  it('maps cost price from compareAtPrice', () => {
    const raw = untransformProduct({
      variants: [
        { id: '1', price: { amount: 3.5, currency: 'GBP' }, compareAtPrice: { amount: 1.2, currency: 'GBP' }, metadata: {} },
      ],
    })
    expect(raw['CostPrice']).toBe(1.2)
  })

  it('sets Archived for ARCHIVED status', () => {
    const raw = untransformProduct({ status: 'ARCHIVED' })
    expect(raw['Archived']).toBe(true)
  })

  it('sets Archived to false for ACTIVE status', () => {
    const raw = untransformProduct({ status: 'ACTIVE' })
    expect(raw['Archived']).toBe(false)
  })
})
