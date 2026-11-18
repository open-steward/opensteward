import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type ShuupStockCount,
} from '../../../../../../../src/verticals/ecommerce/adapters/shuup/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockCount(overrides: Partial<ShuupStockCount> = {}): ShuupStockCount {
  return {
    id: 55,
    product: 123,
    supplier: 1,
    logical_count: 42,
    physical_count: 50,
    stock_managed: true,
    created_on: '2024-01-01T00:00:00Z',
    modified_on: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Shuup)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformInventoryLevel(makeStockCount())
    expect(typeof result.id).toBe('string')
    expect(typeof result.variantId).toBe('string')
    expect(typeof result.locationId).toBe('string')
  })

  it('constructs id from variantId and locationId', () => {
    const result = transformInventoryLevel(makeStockCount())
    expect(result.id).toBe('123:default:1')
    expect(result.variantId).toBe('123:default')
    expect(result.locationId).toBe('1')
  })

  it('maps logical_count to available', () => {
    const result = transformInventoryLevel(makeStockCount({ logical_count: 42 }))
    expect(result.available).toBe(42)
  })

  it('maps physical_count to onHand', () => {
    const result = transformInventoryLevel(makeStockCount({ physical_count: 50 }))
    expect(result.onHand).toBe(50)
  })

  it('handles string logical_count', () => {
    const result = transformInventoryLevel(makeStockCount({ logical_count: '15' }))
    expect(result.available).toBe(15)
  })

  it('handles string physical_count', () => {
    const result = transformInventoryLevel(makeStockCount({ physical_count: '20.000' }))
    expect(result.onHand).toBe(20)
  })

  it('defaults available to 0 when logical_count is null', () => {
    const result = transformInventoryLevel(makeStockCount({ logical_count: null }))
    expect(result.available).toBe(0)
  })

  it('omits onHand when physical_count is 0 or null', () => {
    const result = transformInventoryLevel(makeStockCount({ physical_count: null }))
    expect(result.onHand).toBeUndefined()
  })

  it('uses default supplier id when supplier is null', () => {
    const result = transformInventoryLevel(makeStockCount({ supplier: null }))
    expect(result.locationId).toBe('default')
    expect(result.id).toBe('123:default:default')
  })

  it('uses unknown product id when product is null', () => {
    const result = transformInventoryLevel(makeStockCount({ product: null }))
    expect(result.variantId).toBe('unknown:default')
  })

  it('maps modified_on to updatedAt', () => {
    const result = transformInventoryLevel(makeStockCount())
    expect(result.updatedAt).toBe('2024-06-01T00:00:00Z')
  })

  it('falls back to created_on for updatedAt when modified_on is absent', () => {
    const result = transformInventoryLevel(makeStockCount({ modified_on: null }))
    expect(result.updatedAt).toBe('2024-01-01T00:00:00Z')
  })

  it('handles missing timestamps gracefully', () => {
    const result = transformInventoryLevel(makeStockCount({ modified_on: null, created_on: null }))
    expect(result.updatedAt).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStockCount()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStockCount())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
