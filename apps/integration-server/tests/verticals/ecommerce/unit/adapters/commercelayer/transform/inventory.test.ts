import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  untransformStockItem,
  type RawCLStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockItem(overrides: Partial<RawCLStockItem> = {}): RawCLStockItem {
  return {
    id: 'si-001',
    sku_code: 'TSHIRT-BLU-M',
    quantity: 42,
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-06-01T14:00:00.000Z',
    _type: 'stock_items',
    _relationships: {
      sku: { data: { type: 'skus', id: 'sku-abc123' } },
      stock_location: { data: { type: 'stock_locations', id: 'loc-001' } },
    },
    ...overrides,
  }
}

describe('transformInventoryLevel (Commerce Layer)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(result.id).toBe('si-001')
    expect(result.variantId).toBe('sku-abc123')
    expect(result.locationId).toBe('loc-001')
    expect(result.available).toBe(42)
    expect(result.onHand).toBe(42)
  })

  it('maps timestamps', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(result.updatedAt).toBe('2024-06-01T14:00:00.000Z')
  })

  it('defaults quantity to 0 when missing', () => {
    const result = transformInventoryLevel(makeStockItem({ quantity: undefined }))
    expect(result.available).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('handles missing relationships', () => {
    const result = transformInventoryLevel(makeStockItem({ _relationships: undefined }))
    expect(result.variantId).toBe('')
    expect(result.locationId).toBe('')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStockItem()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('untransformStockItem (Commerce Layer)', () => {
  it('produces JSON:API body with relationships', () => {
    const body = untransformStockItem({
      variantId: 'sku-001',
      locationId: 'loc-001',
      available: 50,
    }) as { data: { type: string; attributes: Record<string, unknown>; relationships: Record<string, unknown> } }
    expect(body.data.type).toBe('stock_items')
    expect(body.data.attributes['quantity']).toBe(50)
    expect(body.data.relationships['sku']).toEqual({
      data: { type: 'skus', id: 'sku-001' },
    })
    expect(body.data.relationships['stock_location']).toEqual({
      data: { type: 'stock_locations', id: 'loc-001' },
    })
  })
})
