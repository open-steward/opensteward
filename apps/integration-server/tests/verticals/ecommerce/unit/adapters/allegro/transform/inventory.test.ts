import { describe, it, expect } from 'vitest'
import { transformInventoryLevel } from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/inventory'
import type { RawAllegroOffer } from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/product'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeOffer(overrides: Partial<RawAllegroOffer> = {}): RawAllegroOffer {
  return {
    id: 'offer-123',
    name: 'Test Product',
    stock: { available: 42, sold: 10 },
    ...overrides,
  }
}

describe('transformInventoryLevel (Allegro)', () => {
  it('synthesizes id from offer id and default location', () => {
    const result = transformInventoryLevel(makeOffer())
    expect(result.id).toBe('offer-123:allegro-default')
    expect(result.variantId).toBe('offer-123')
    expect(result.locationId).toBe('allegro-default')
  })

  it('maps available from stock.available', () => {
    const result = transformInventoryLevel(makeOffer())
    expect(result.available).toBe(42)
  })

  it('defaults to 0 when stock is absent', () => {
    const result = transformInventoryLevel(makeOffer({ stock: undefined }))
    expect(result.available).toBe(0)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeOffer())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeOffer()
    const result = transformInventoryLevel(raw)
    expect(result.metadata['id']).toBe('offer-123')
  })
})
