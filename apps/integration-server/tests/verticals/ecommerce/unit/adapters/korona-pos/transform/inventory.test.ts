/**
 * Shape verified against `components.schemas.ProductStock` and `Amount` on
 * https://128.koronacloud.com/web/api/v3/openapi.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type KoronaProductStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/korona-pos/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<KoronaProductStock> = {}): KoronaProductStock {
  return {
    amount: { actual: 42, ordered: 10 },
    product: { id: '44444444-4444-4444-4444-444444444444' },
    warehouse: { id: '33333333-3333-3333-3333-333333333333' },
    ...overrides,
  }
}

describe('transformInventoryLevel (korona-pos)', () => {
  it('synthesises id as productId:warehouseId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result?.id).toBe('44444444-4444-4444-4444-444444444444:33333333-3333-3333-3333-333333333333')
    expect(result?.variantId).toBe('44444444-4444-4444-4444-444444444444')
    expect(result?.locationId).toBe('33333333-3333-3333-3333-333333333333')
  })

  it('maps amount.actual to available and amount.ordered to incoming', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result?.available).toBe(42)
    expect(result?.incoming).toBe(10)
  })

  it('does not map amount.lent to committed — no such correspondence is documented', () => {
    const result = transformInventoryLevel(makeRaw({ amount: { actual: 5 } }))
    expect(result?.committed).toBeUndefined()
  })

  it('returns undefined, not a row with a fabricated zero, when amount.actual is not reported', () => {
    expect(transformInventoryLevel(makeRaw({ amount: {} }))).toBeUndefined()
    expect(transformInventoryLevel(makeRaw({ amount: undefined }))).toBeUndefined()
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const level = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(level)).not.toThrow()
  })
})
