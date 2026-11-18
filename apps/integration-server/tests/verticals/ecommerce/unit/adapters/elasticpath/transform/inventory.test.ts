import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawEpInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/inventory'
import { SYNTHETIC_LOCATION_ID } from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/location'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawEpInventory> = {}): RawEpInventory {
  return {
    id: 'stock-001',
    type: 'stock',
    total: 150,
    available: 100,
    allocated: 50,
    ...overrides,
  }
}

describe('transformInventoryLevel (Elastic Path)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeInventory(), 'prod-001')
    expect(result.id).toBe(`prod-001:${SYNTHETIC_LOCATION_ID}`)
    expect(result.variantId).toBe('prod-001')
    expect(result.locationId).toBe(SYNTHETIC_LOCATION_ID)
    expect(result.available).toBe(100)
    expect(result.committed).toBe(50)
    expect(result.onHand).toBe(150)
  })

  it('uses raw.id as productId when no productId given', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.variantId).toBe('stock-001')
    expect(result.id).toBe(`stock-001:${SYNTHETIC_LOCATION_ID}`)
  })

  it('defaults available to 0 when missing', () => {
    const result = transformInventoryLevel(
      makeInventory({ available: undefined, total: undefined, allocated: undefined }),
      'prod-001',
    )
    expect(result.available).toBe(0)
    expect(result.committed).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeInventory()
    const result = transformInventoryLevel(raw, 'prod-001')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory(), 'prod-001')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
