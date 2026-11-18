import { describe, it, expect } from 'vitest'
import {
  deriveLocation,
  deriveLocationsFromVariants,
} from '../../../../../../../src/verticals/inventory/adapters/inventory-planner/transform/location'
import type { RawInventoryPlannerVariant } from '../../../../../../../src/verticals/inventory/adapters/inventory-planner/transform/product'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('inventory-planner deriveLocation', () => {
  it('maps id, externalId, and name from warehouse name', () => {
    const result = deriveLocation('US Warehouse')
    expect(result.id).toBe('US Warehouse')
    expect(result.externalId).toBe('US Warehouse')
    expect(result.name).toBe('US Warehouse')
  })

  it('sets type to warehouse', () => {
    const result = deriveLocation('UK Warehouse')
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive to true', () => {
    const result = deriveLocation('EU Warehouse')
    expect(result.isActive).toBe(true)
  })

  it('sets platform to inventory-planner', () => {
    const result = deriveLocation('CA Warehouse')
    expect(result.platform).toBe('inventory-planner')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = deriveLocation('AU Warehouse')
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('inventory-planner deriveLocationsFromVariants', () => {
  const variants: RawInventoryPlannerVariant[] = [
    {
      _id: 'v1',
      sku: 'SKU-001',
      warehouses: {
        'US Warehouse': { in_stock: 50, on_order: 10 },
        'UK Warehouse': { in_stock: 20 },
      },
    },
    {
      _id: 'v2',
      sku: 'SKU-002',
      warehouses: {
        'US Warehouse': { in_stock: 30 },
        'EU Warehouse': { in_stock: 15 },
      },
    },
  ]

  it('returns one location per unique warehouse name', () => {
    const locations = deriveLocationsFromVariants(variants)
    expect(locations).toHaveLength(3)
    const ids = locations.map((l) => l.id).sort()
    expect(ids).toEqual(['EU Warehouse', 'UK Warehouse', 'US Warehouse'])
  })

  it('deduplicates warehouse names that appear in multiple variants', () => {
    const locations = deriveLocationsFromVariants(variants)
    const usCount = locations.filter((l) => l.id === 'US Warehouse').length
    expect(usCount).toBe(1)
  })

  it('skips variants with no warehouses object', () => {
    const locations = deriveLocationsFromVariants([{ _id: 'v3', sku: 'SKU-003' }])
    expect(locations).toHaveLength(0)
  })
})
