import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawInsalesVariantStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/insales/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariantStock(overrides: Partial<RawInsalesVariantStock> = {}): RawInsalesVariantStock {
  return {
    id: 5001,
    product_id: 42,
    quantity: 30,
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (insales)', () => {
  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeVariantStock())
    expect(result.id).toBe('5001:default')
  })

  it('maps variantId as string from id', () => {
    const result = transformInventoryLevel(makeVariantStock())
    expect(result.variantId).toBe('5001')
  })

  it('uses default locationId', () => {
    const result = transformInventoryLevel(makeVariantStock())
    expect(result.locationId).toBe('default')
  })

  it('accepts custom locationId', () => {
    const result = transformInventoryLevel(makeVariantStock(), 'warehouse-1')
    expect(result.locationId).toBe('warehouse-1')
    expect(result.id).toBe('5001:warehouse-1')
  })

  it('maps available from quantity', () => {
    const result = transformInventoryLevel(makeVariantStock())
    expect(result.available).toBe(30)
  })

  it('clamps available to 0 when quantity is negative', () => {
    const result = transformInventoryLevel(makeVariantStock({ quantity: -5 }))
    expect(result.available).toBe(0)
  })

  it('maps available to 0 when quantity is null', () => {
    const result = transformInventoryLevel(makeVariantStock({ quantity: null }))
    expect(result.available).toBe(0)
  })

  it('maps updatedAt', () => {
    const result = transformInventoryLevel(makeVariantStock())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeVariantStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
