import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformLocation,
  buildInventoryLevel,
  type DrupalVariationStock,
  type DrupalStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/drupal-commerce/transform/inventory'
import {
  InventoryLevelSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/inventory'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeVariationStock(
  overrides: Partial<DrupalVariationStock['attributes']> = {},
): DrupalVariationStock {
  return {
    type: 'commerce_product_variation--default',
    id: 'var-uuid-001',
    attributes: {
      sku: 'TSHIRT-BLU-M',
      field_stock: 42,
      ...overrides,
    },
    relationships: {},
  }
}

function makeStockLocation(
  overrides: Partial<DrupalStockLocation['attributes']> = {},
): DrupalStockLocation {
  return {
    type: 'commerce_store--online',
    id: 'store-uuid-001',
    attributes: {
      name: 'Main Warehouse',
      status: true,
      ...overrides,
    },
    relationships: {},
  }
}

// ── transformInventoryLevel ───────────────────────────────────────────────────

describe('transformInventoryLevel (Drupal Commerce)', () => {
  it('maps field_stock as available and onHand', () => {
    const result = transformInventoryLevel(makeVariationStock())
    expect(result.available).toBe(42)
    expect(result.onHand).toBe(42)
  })

  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeVariationStock(), 'store-uuid-001')
    expect(result.id).toBe('var-uuid-001:store-uuid-001')
  })

  it('sets variantId to the variation resource id', () => {
    const result = transformInventoryLevel(makeVariationStock(), 'store-uuid-001')
    expect(result.variantId).toBe('var-uuid-001')
  })

  it('sets locationId from caller-provided value', () => {
    const result = transformInventoryLevel(makeVariationStock(), 'warehouse-001')
    expect(result.locationId).toBe('warehouse-001')
  })

  it('defaults locationId to "default" when not provided', () => {
    const result = transformInventoryLevel(makeVariationStock())
    expect(result.locationId).toBe('default')
    expect(result.id).toBe('var-uuid-001:default')
  })

  it('falls back to field_inventory when field_stock is missing', () => {
    const result = transformInventoryLevel(
      makeVariationStock({ field_stock: null, field_inventory: 15 }),
    )
    expect(result.available).toBe(15)
  })

  it('defaults to 0 when both stock fields are missing', () => {
    const result = transformInventoryLevel(
      makeVariationStock({ field_stock: null, field_inventory: null }),
    )
    expect(result.available).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('handles zero stock', () => {
    const result = transformInventoryLevel(makeVariationStock({ field_stock: 0 }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariationStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeVariationStock(), 'store-uuid-001')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

// ── transformLocation ─────────────────────────────────────────────────────────

describe('transformLocation (Drupal Commerce)', () => {
  it('maps location name', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.id).toBe('store-uuid-001')
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps active=true for status=true', () => {
    const result = transformLocation(makeStockLocation({ status: true }))
    expect(result.active).toBe(true)
  })

  it('maps active=false for status=false', () => {
    const result = transformLocation(makeStockLocation({ status: false }))
    expect(result.active).toBe(false)
  })

  it('maps active=false for numeric status=0', () => {
    const result = transformLocation(makeStockLocation({ status: 0 }))
    expect(result.active).toBe(false)
  })

  it('maps active=true for numeric status=1', () => {
    const result = transformLocation(makeStockLocation({ status: 1 }))
    expect(result.active).toBe(true)
  })

  it('defaults to active=true when status is missing', () => {
    const result = transformLocation(makeStockLocation({ status: undefined }))
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter=true', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('uses fallback name when name is missing', () => {
    const result = transformLocation(makeStockLocation({ name: undefined }))
    expect(result.name).toBe('Default Location')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStockLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeStockLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

// ── buildInventoryLevel ───────────────────────────────────────────────────────

describe('buildInventoryLevel (Drupal Commerce)', () => {
  it('builds a synthetic inventory level from explicit data', () => {
    const result = buildInventoryLevel({
      variantId: 'var-001',
      locationId: 'loc-001',
      available: 100,
    })
    expect(result.id).toBe('var-001:loc-001')
    expect(result.variantId).toBe('var-001')
    expect(result.locationId).toBe('loc-001')
    expect(result.available).toBe(100)
    expect(result.onHand).toBe(100)
  })

  it('uses provided raw resource in metadata when given', () => {
    const rawResource = makeVariationStock()
    const result = buildInventoryLevel({
      variantId: 'var-001',
      locationId: 'loc-001',
      available: 50,
      raw: rawResource,
    })
    expect(result.metadata).toBe(rawResource)
  })

  it('uses synthetic metadata when no raw resource provided', () => {
    const result = buildInventoryLevel({
      variantId: 'var-001',
      locationId: 'loc-001',
      available: 25,
    })
    expect((result.metadata as Record<string, unknown>)['synthetic']).toBe(true)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = buildInventoryLevel({
      variantId: 'var-001',
      locationId: 'loc-001',
      available: 10,
    })
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
