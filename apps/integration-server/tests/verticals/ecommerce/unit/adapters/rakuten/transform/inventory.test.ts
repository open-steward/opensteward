import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RakutenInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/rakuten/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventoryItem(
  overrides: Partial<RakutenInventoryItem> = {},
): RakutenInventoryItem {
  return {
    itemUrl: 'my-shop/awesome-headphones',
    remainingCount: 42,
    normalInventoryStock: 100,
    orderedCount: 8,
    inventoryType: 1,
    updateDatetime: '2024-03-01T12:00:00+09:00',
    ...overrides,
  }
}

describe('transformInventoryLevel (Rakuten)', () => {
  it('synthesises id as itemUrl:rakuten-default', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.id).toBe('my-shop/awesome-headphones:rakuten-default')
  })

  it('sets variantId to itemUrl', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.variantId).toBe('my-shop/awesome-headphones')
  })

  it('sets locationId to rakuten-default', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.locationId).toBe('rakuten-default')
  })

  it('uses remainingCount as available stock', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.available).toBe(42)
  })

  it('falls back to normalInventoryStock when remainingCount is null', () => {
    const result = transformInventoryLevel(makeInventoryItem({ remainingCount: null }))
    expect(result.available).toBe(100)
  })

  it('defaults to 0 when both remainingCount and normalInventoryStock are absent', () => {
    const result = transformInventoryLevel(
      makeInventoryItem({ remainingCount: undefined, normalInventoryStock: undefined }),
    )
    expect(result.available).toBe(0)
  })

  it('maps orderedCount to committed', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.committed).toBe(8)
  })

  it('computes onHand as available + committed', () => {
    const result = transformInventoryLevel(makeInventoryItem({ remainingCount: 42, orderedCount: 8 }))
    expect(result.onHand).toBe(50)
  })

  it('leaves onHand undefined when orderedCount is absent', () => {
    const result = transformInventoryLevel(makeInventoryItem({ orderedCount: undefined }))
    expect(result.onHand).toBeUndefined()
  })

  it('maps updateDatetime to updatedAt', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(result.updatedAt).toBe('2024-03-01T12:00:00+09:00')
  })

  it('leaves updatedAt undefined when updateDatetime absent', () => {
    const result = transformInventoryLevel(makeInventoryItem({ updateDatetime: undefined }))
    expect(result.updatedAt).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeInventoryItem()
    const result = transformInventoryLevel(raw)
    expect(result.metadata['itemUrl']).toBe('my-shop/awesome-headphones')
    expect(result.metadata['remainingCount']).toBe(42)
    expect(result.metadata['inventoryType']).toBe(1)
  })

  it('satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventoryItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('handles itemUrl with slashes correctly in id', () => {
    const result = transformInventoryLevel(makeInventoryItem({ itemUrl: 'shop-a/cat/item-xyz' }))
    expect(result.id).toBe('shop-a/cat/item-xyz:rakuten-default')
    expect(result.variantId).toBe('shop-a/cat/item-xyz')
  })

  it('handles zero remainingCount correctly', () => {
    const result = transformInventoryLevel(makeInventoryItem({ remainingCount: 0 }))
    expect(result.available).toBe(0)
  })

  it('handles unmanaged inventory (inventoryType 0) with null remainingCount', () => {
    // inventoryType=0 means no quantity management — remainingCount may be null
    const result = transformInventoryLevel(
      makeInventoryItem({ inventoryType: 0, remainingCount: null, normalInventoryStock: 0 }),
    )
    expect(result.available).toBe(0)
  })
})
