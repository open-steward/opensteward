import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformStockLocation,
  buildInventoryLevel,
  type AimeosStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/aimeos/transform/inventory'
import {
  InventoryLevelSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/inventory'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeStock(
  overrides: Partial<AimeosStock['attributes']> = {},
): AimeosStock {
  return {
    type: 'stock',
    id: 'stock-001',
    attributes: {
      'stock.id': 'stock-001',
      'stock.productid': 'prod-001',
      'stock.productcode': 'TSHIRT-BLU',
      'stock.stocklevel': 50,
      'stock.type': 'default',
      'stock.backdate': null,
      'stock.ctime': '2024-05-01T00:00:00+00:00',
      'stock.mtime': '2024-06-01T00:00:00+00:00',
      ...overrides,
    },
  }
}

// ── transformInventoryLevel ───────────────────────────────────────────────────

describe('transformInventoryLevel (Aimeos)', () => {
  it('maps core inventory level fields', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('prod-001:default')
    expect(result.variantId).toBe('prod-001')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(50)
    expect(result.onHand).toBe(50)
  })

  it('uses stock.type as locationId', () => {
    const result = transformInventoryLevel(makeStock({ 'stock.type': 'warehouse-1' }))
    expect(result.locationId).toBe('warehouse-1')
    expect(result.id).toBe('prod-001:warehouse-1')
  })

  it('synthesises id as productId:stockType', () => {
    const result = transformInventoryLevel(makeStock({
      'stock.productid': 'prod-abc',
      'stock.type': 'store-nyc',
    }))
    expect(result.id).toBe('prod-abc:store-nyc')
    expect(result.variantId).toBe('prod-abc')
  })

  it('maps null stocklevel to 999999 (unlimited)', () => {
    const result = transformInventoryLevel(makeStock({ 'stock.stocklevel': null }))
    expect(result.available).toBe(999999)
  })

  it('handles zero stocklevel', () => {
    const result = transformInventoryLevel(makeStock({ 'stock.stocklevel': 0 }))
    expect(result.available).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('maps updatedAt from stock.mtime', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.updatedAt).toBe('2024-06-01T00:00:00+00:00')
  })

  it('handles string productid', () => {
    const result = transformInventoryLevel(makeStock({ 'stock.productid': '42' }))
    expect(result.variantId).toBe('42')
  })

  it('handles numeric productid', () => {
    const result = transformInventoryLevel(makeStock({ 'stock.productid': 99 }))
    expect(result.variantId).toBe('99')
  })

  it('falls back to resource id when productid is missing', () => {
    const result = transformInventoryLevel(makeStock({ 'stock.productid': undefined }))
    expect(result.variantId).toBe('stock-001')
  })

  it('defaults locationId to "default" when stock.type is missing', () => {
    const result = transformInventoryLevel(makeStock({ 'stock.type': undefined }))
    expect(result.locationId).toBe('default')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

// ── transformStockLocation ────────────────────────────────────────────────────

describe('transformStockLocation (Aimeos)', () => {
  it('uses stock.type as location id', () => {
    const result = transformStockLocation(makeStock())
    expect(result.id).toBe('default')
  })

  it('generates a human-readable name from stock type', () => {
    const result = transformStockLocation(makeStock({ 'stock.type': 'warehouse-1' }))
    expect(result.name).toBe('Warehouse 1')
  })

  it('capitalises "default" stock type name', () => {
    const result = transformStockLocation(makeStock({ 'stock.type': 'default' }))
    expect(result.name).toBe('Default')
  })

  it('sets active to true', () => {
    const result = transformStockLocation(makeStock())
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter to true', () => {
    const result = transformStockLocation(makeStock())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformStockLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = transformStockLocation(makeStock())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

// ── buildInventoryLevel ───────────────────────────────────────────────────────

describe('buildInventoryLevel (Aimeos)', () => {
  it('builds inventory level from explicit data', () => {
    const result = buildInventoryLevel({
      variantId: 'prod-123',
      locationId: 'warehouse-2',
      available: 100,
    })
    expect(result.id).toBe('prod-123:warehouse-2')
    expect(result.variantId).toBe('prod-123')
    expect(result.locationId).toBe('warehouse-2')
    expect(result.available).toBe(100)
    expect(result.onHand).toBe(100)
  })

  it('sets updatedAt to current ISO time', () => {
    const before = new Date().toISOString()
    const result = buildInventoryLevel({
      variantId: 'v1',
      locationId: 'loc1',
      available: 5,
    })
    const after = new Date().toISOString()
    expect(result.updatedAt! >= before).toBe(true)
    expect(result.updatedAt! <= after).toBe(true)
  })

  it('uses synthetic metadata when no raw resource provided', () => {
    const result = buildInventoryLevel({
      variantId: 'v1',
      locationId: 'loc1',
      available: 10,
    })
    expect((result.metadata as Record<string, unknown>)['synthetic']).toBe(true)
  })

  it('uses provided raw resource in metadata', () => {
    const raw = makeStock()
    const result = buildInventoryLevel({
      variantId: 'prod-001',
      locationId: 'default',
      available: 50,
      raw,
    })
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = buildInventoryLevel({
      variantId: 'prod-123',
      locationId: 'default',
      available: 25,
    })
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
