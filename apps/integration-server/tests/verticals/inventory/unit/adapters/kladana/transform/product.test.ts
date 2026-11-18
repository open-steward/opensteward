import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawKladanaProduct,
} from '../../../../../../../src/verticals/inventory/adapters/kladana/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('kladana transformProduct', () => {
  const raw: RawKladanaProduct = {
    id: 'prod-uuid-001',
    name: 'Premium Coffee Beans',
    description: 'Arabica, medium roast',
    article: 'ART-001',
    code: 'CODE-001',
    externalCode: 'EXT-001',
    archived: false,
    weight: 1.5,
    barcodes: [{ ean13: '4607034190002' }],
    salePrices: [{ value: 50000 }],
    buyPrice: { value: 30000 },
    pathName: 'Food / Coffee',
    supplier: {
      meta: {
        href: 'https://api.kladana.in/api/remap/1.2/entity/counterparty/sup-uuid-001',
      },
    },
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
  }

  it('maps id from raw.id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-uuid-001')
    expect(result.externalId).toBe('prod-uuid-001')
  })

  it('maps sku from article', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('ART-001')
  })

  it('falls back to code when article is missing', () => {
    const result = transformProduct({ ...raw, article: undefined })
    expect(result.sku).toBe('CODE-001')
  })

  it('maps name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Premium Coffee Beans')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Arabica, medium roast')
  })

  it('extracts upc from first barcode object', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('4607034190002')
  })

  it('maps category from pathName', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Food / Coffee')
  })

  it('converts weight from kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(1500)
  })

  it('maps retailPrice in kopecks (already minor units) with USD currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(50000)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps cost from buyPrice in kopecks', () => {
    const result = transformProduct(raw)
    expect(result.cost?.amount).toBe(30000)
  })

  it('extracts supplierId from supplier meta href', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['sup-uuid-001'])
  })

  it('sets isActive false when archived=true', () => {
    const result = transformProduct({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to kladana', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('kladana')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
