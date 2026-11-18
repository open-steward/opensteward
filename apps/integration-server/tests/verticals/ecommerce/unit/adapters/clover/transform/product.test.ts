import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  cloverCentsToMinor,
  type RawCloverItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawCloverItem> = {}): RawCloverItem {
  return {
    id: 'ITEM_001',
    name: 'Latte',
    alternateName: 'Hot latte drink',
    code: 'LAT-001',
    sku: 'LAT-SKU',
    price: 450,
    priceType: 'FIXED',
    hidden: false,
    isRevenue: true,
    createdTime: 1704067200000, // 2024-01-01T00:00:00Z
    modifiedTime: 1706745600000, // 2024-02-01T00:00:00Z
    itemGroup: { id: 'GRP_1', name: 'Beverages' },
    ...overrides,
  }
}

describe('cloverCentsToMinor', () => {
  it('passes integer cents through unchanged', () => {
    expect(cloverCentsToMinor(450)).toBe(450)
  })

  it('returns 0 for undefined', () => {
    expect(cloverCentsToMinor(undefined)).toBe(0)
  })

  it('handles zero', () => {
    expect(cloverCentsToMinor(0)).toBe(0)
  })
})

describe('transformProduct (Clover)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('ITEM_001')
    expect(result.title).toBe('Latte')
    expect(result.description).toBe('Hot latte drink')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('Beverages')
  })

  it('creates a single variant from the item', () => {
    const result = transformProduct(makeItem())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('ITEM_001')
    expect(v.sku).toBe('LAT-SKU')
    expect(v.price).toEqual({ amount: 450, currency: 'USD' })
  })

  it('falls back to code if sku is missing', () => {
    const result = transformProduct(makeItem({ sku: undefined }))
    expect(result.variants![0]!.sku).toBe('LAT-001')
  })

  it('maps timestamps from epoch ms', () => {
    const result = transformProduct(makeItem())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('marks hidden items as ARCHIVED', () => {
    const result = transformProduct(makeItem({ hidden: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const minimal: RawCloverItem = { id: 'ITEM_MIN' }
    const result = transformProduct(minimal)
    expect(result.id).toBe('ITEM_MIN')
    expect(result.title).toBe('')
    expect(result.status).toBe('ACTIVE')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Clover)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformProduct(makeItem())
    const raw = untransformProduct(canonical)
    expect(raw['name']).toBe('Latte')
    expect(raw['alternateName']).toBe('Hot latte drink')
  })

  it('converts price back to cents', () => {
    const raw = untransformProduct({
      title: 'Test',
      variants: [{ id: '1', price: { amount: 450, currency: 'USD' }, metadata: {} }],
    })
    expect(raw['price']).toBe(450)
  })

  it('sets hidden for ARCHIVED status', () => {
    const raw = untransformProduct({ status: 'ARCHIVED' })
    expect(raw['hidden']).toBe(true)
  })
})
