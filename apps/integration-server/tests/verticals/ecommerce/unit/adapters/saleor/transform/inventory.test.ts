import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawSaleorStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawSaleorStock> = {}): RawSaleorStock {
  return {
    id: 'U3RvY2s6MQ==',
    warehouse: { id: 'WH1' },
    quantity: 100,
    quantityAllocated: 15,
    productVariant: { id: 'VAR1' },
    ...overrides,
  }
}

describe('transformInventoryLevel (Saleor)', () => {
  it('maps core fields with composite id', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('VAR1:WH1')
    expect(result.variantId).toBe('VAR1')
    expect(result.locationId).toBe('WH1')
  })

  it('computes available from quantity minus allocated', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.available).toBe(85)
    expect(result.committed).toBe(15)
    expect(result.onHand).toBe(100)
  })

  it('accepts a variantId override', () => {
    const result = transformInventoryLevel(makeStock(), 'OVERRIDE_VAR')
    expect(result.variantId).toBe('OVERRIDE_VAR')
    expect(result.id).toBe('OVERRIDE_VAR:WH1')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
