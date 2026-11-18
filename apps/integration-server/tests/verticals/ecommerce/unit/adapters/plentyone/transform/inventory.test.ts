import { describe, it, expect } from 'vitest'
import {
  transformStock,
  type RawPlentyOneStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/plentyone/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawPlentyOneStock> = {}): RawPlentyOneStock {
  return {
    variationId: 601,
    warehouseId: 22,
    netStock: 50,
    physicalStock: 55,
    reservedStock: 5,
    updatedAt: '2024-05-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('plentyone transformStock', () => {
  it('synthesises id as variationId:warehouseId', () => {
    const result = transformStock(makeStock())
    expect(result.id).toBe('601:22')
    expect(result.variantId).toBe('601')
    expect(result.locationId).toBe('22')
  })

  it('uses netStock as available', () => {
    const result = transformStock(makeStock())
    expect(result.available).toBe(50)
  })

  it('falls back to stockNet (bulk endpoint field name)', () => {
    const result = transformStock(
      makeStock({ netStock: undefined, stockNet: 30, physicalStock: undefined }),
    )
    expect(result.available).toBe(30)
  })

  it('maps physicalStock to onHand', () => {
    const result = transformStock(makeStock())
    expect(result.onHand).toBe(55)
  })

  it('falls back to stockPhysical for onHand', () => {
    const result = transformStock(
      makeStock({ physicalStock: undefined, stockPhysical: 60 }),
    )
    expect(result.onHand).toBe(60)
  })

  it('maps reservedStock to committed', () => {
    const result = transformStock(makeStock())
    expect(result.committed).toBe(5)
  })

  it('clamps available to 0 when net is negative', () => {
    const result = transformStock(makeStock({ netStock: -5 }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformStock(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformStock(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
