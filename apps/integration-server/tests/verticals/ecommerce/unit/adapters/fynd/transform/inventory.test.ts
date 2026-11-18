/**
 * Fixture shape verified against `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Catalog/CatalogPlatformModel.js` — `GetInventories()`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawFyndInventoryArticle,
} from '../../../../../../../src/verticals/ecommerce/adapters/fynd/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeArticle(overrides: Partial<RawFyndInventoryArticle> = {}): RawFyndInventoryArticle {
  return {
    seller_identifier: 'SHIRT-R-M',
    quantities: {
      sellable: { count: 42, updated_at: '2026-02-01T14:20:00.000Z' },
      order_committed: { count: 3 },
    },
    store: { uid: 99 },
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('maps id from seller_identifier and store.uid', () => {
    const result = transformInventoryLevel(makeArticle())
    expect(result.id).toBe('SHIRT-R-M:99')
    expect(result.variantId).toBe('SHIRT-R-M')
    expect(result.locationId).toBe('99')
  })

  it('maps sellable count to available, and adds order_committed for onHand', () => {
    const result = transformInventoryLevel(makeArticle())
    expect(result.available).toBe(42)
    expect(result.committed).toBe(3)
    expect(result.onHand).toBe(45)
  })

  it('throws rather than defaulting when seller_identifier is missing', () => {
    expect(() =>
      transformInventoryLevel({ ...makeArticle(), seller_identifier: undefined }),
    ).toThrow(/seller_identifier/)
  })

  it('throws rather than defaulting to zero when sellable count is missing', () => {
    expect(() =>
      transformInventoryLevel({ ...makeArticle(), quantities: { sellable: undefined } }),
    ).toThrow(/sellable/)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeArticle()
    expect(transformInventoryLevel(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeArticle())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
