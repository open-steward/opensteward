import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawOpenCartProductStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/opencart/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeProductStock(
  overrides: Partial<RawOpenCartProductStock> = {},
): RawOpenCartProductStock {
  return {
    product_id: 42,
    quantity: 150,
    stock_status_id: 7,
    date_modified: '2024-03-15T08:30:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (OpenCart)', () => {
  it('synthesises a composite id and default location', () => {
    const result = transformInventoryLevel(makeProductStock(), '42')
    expect(result.id).toBe('42:default:default')
    expect(typeof result.id).toBe('string')
    expect(result.variantId).toBe('42:default')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(150)
    expect(result.updatedAt).toBe('2024-03-15T08:30:00.000Z')
  })

  it('handles string quantity', () => {
    const result = transformInventoryLevel(
      makeProductStock({ quantity: '75' }),
      '42',
    )
    expect(result.available).toBe(75)
  })

  it('defaults null quantity to 0', () => {
    const result = transformInventoryLevel(
      makeProductStock({ quantity: null }),
      '42',
    )
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata and validates against InventoryLevelSchema', () => {
    const raw = makeProductStock()
    const result = transformInventoryLevel(raw, '42')
    expect(result.metadata).toBe(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
