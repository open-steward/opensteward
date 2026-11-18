import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawManomanoStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/manomano/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawManomanoStock> = {}): RawManomanoStock {
  return {
    sku_id: 'SKU-001',
    quantity: 42,
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (ManoMano)', () => {
  it('maps fields correctly', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('SKU-001:default')
    expect(result.variantId).toBe('SKU-001')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(42)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('synthesises id as {sku_id}:default', () => {
    const result = transformInventoryLevel(makeRaw({ sku_id: 'BOLT-42' }))
    expect(result.id).toBe('BOLT-42:default')
    expect(result.variantId).toBe('BOLT-42')
  })

  it('defaults to 0 when quantity is null', () => {
    const result = transformInventoryLevel(makeRaw({ quantity: null }))
    expect(result.available).toBe(0)
  })

  it('defaults to 0 when quantity is absent', () => {
    const result = transformInventoryLevel(makeRaw({ quantity: undefined }))
    expect(result.available).toBe(0)
  })

  it('uses "unknown" sku_id when sku_id is absent', () => {
    const result = transformInventoryLevel(makeRaw({ sku_id: undefined }))
    expect(result.id).toBe('unknown:default')
    expect(result.variantId).toBe('unknown')
  })

  it('produces schema-valid output', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })
})
