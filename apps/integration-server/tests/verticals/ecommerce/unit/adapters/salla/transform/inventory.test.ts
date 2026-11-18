import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawSallaProductQuantity,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeQuantity(
  overrides: Partial<RawSallaProductQuantity> = {},
): RawSallaProductQuantity {
  return {
    id: 200,
    product_id: 1234,
    quantity: 42,
    unlimited: false,
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('constructs id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeQuantity())
    expect(result.id).toBe('1234:default')
  })

  it('uses product_id as variantId when present', () => {
    const result = transformInventoryLevel(makeQuantity())
    expect(result.variantId).toBe('1234')
  })

  it('falls back to id as variantId when product_id absent', () => {
    const result = transformInventoryLevel(makeQuantity({ product_id: undefined }))
    expect(result.variantId).toBe('200')
    expect(result.id).toBe('200:default')
  })

  it('uses "default" as locationId', () => {
    const result = transformInventoryLevel(makeQuantity())
    expect(result.locationId).toBe('default')
  })

  it('maps quantity to available', () => {
    const result = transformInventoryLevel(makeQuantity())
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when quantity is null', () => {
    const result = transformInventoryLevel(makeQuantity({ quantity: null }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeQuantity()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeQuantity())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
