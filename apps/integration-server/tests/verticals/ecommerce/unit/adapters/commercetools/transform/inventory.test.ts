import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawCtInventoryEntry,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeEntry(overrides: Partial<RawCtInventoryEntry> = {}): RawCtInventoryEntry {
  return {
    id: 'inv-1',
    version: 2,
    sku: 'CB-250',
    supplyChannel: { id: 'chan-warehouse-1', typeId: 'channel' },
    quantityOnStock: 100,
    availableQuantity: 95,
    lastModifiedAt: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (commercetools)', () => {
  it('maps sku into variantId and channel id into locationId', () => {
    const r = transformInventoryLevel(makeEntry())
    expect(r.variantId).toBe('CB-250')
    expect(r.locationId).toBe('chan-warehouse-1')
  })

  it('uses quantityOnStock for onHand and availableQuantity for available', () => {
    const r = transformInventoryLevel(makeEntry())
    expect(r.onHand).toBe(100)
    expect(r.available).toBe(95)
  })

  it("falls back to 'default' when supplyChannel is missing", () => {
    const r = transformInventoryLevel(makeEntry({ supplyChannel: undefined }))
    expect(r.locationId).toBe('default')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const r = transformInventoryLevel(makeEntry())
    expect(() => InventoryLevelSchema.parse(r)).not.toThrow()
  })

  it('round-trips writable fields via untransformInventoryLevel', () => {
    const canonical = transformInventoryLevel(makeEntry())
    const raw = untransformInventoryLevel(canonical) as Record<string, unknown>
    expect(raw['sku']).toBe('CB-250')
    expect(raw['quantityOnStock']).toBe(95)
    const channel = raw['supplyChannel'] as { id: string }
    expect(channel.id).toBe('chan-warehouse-1')
  })
})
