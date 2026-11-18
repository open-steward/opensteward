/**
 * GOFRUGAL Item stock → canonical InventoryLevel[] transform tests.
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/list-all-items
 */
import { describe, it, expect } from 'vitest'
import { transformInventoryLevels } from '../../../../../../../src/verticals/ecommerce/adapters/gofrugal/transform/inventory'
import type { RawGofrugalItem } from '../../../../../../../src/verticals/ecommerce/adapters/gofrugal/transform/product'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeItem(overrides: Partial<RawGofrugalItem> = {}): RawGofrugalItem {
  return {
    itemId: 1,
    itemName: 'bat',
    locationId: 225,
    stock: [{ stock: 7, salePrice: 120, mrp: 130, itemReferenceCode: '', taxPercentage: 12 }],
    ...overrides,
  }
}

describe('GOFRUGAL transform/inventory', () => {
  it('maps one InventoryLevel per stock row and survives InventoryLevelSchema.parse', () => {
    const levels = transformInventoryLevels(makeItem())
    expect(levels).toHaveLength(1)
    for (const level of levels) expect(InventoryLevelSchema.parse(level)).toBeTruthy()
    expect(levels[0]).toMatchObject({
      variantId: '1:default',
      locationId: '225',
      available: 7,
    })
  })

  it('produces one level per entry when an item has multiple stock rows', () => {
    const levels = transformInventoryLevels(
      makeItem({
        stock: [
          { stock: 3, salePrice: 10, itemReferenceCode: 'A' },
          { stock: 5, salePrice: 12, itemReferenceCode: 'B' },
        ],
      }),
    )
    expect(levels).toHaveLength(2)
    expect(levels.map((l) => l.available)).toEqual([3, 5])
    expect(levels[0]!.id).not.toBe(levels[1]!.id)
  })

  it('clamps a negative or fractional stock value to a non-negative integer', () => {
    const levels = transformInventoryLevels(makeItem({ stock: [{ stock: -0.4 }] }))
    expect(InventoryLevelSchema.parse(levels[0])).toBeTruthy()
    expect(levels[0]!.available).toBe(0)
  })

  it('returns an empty array when the item has no stock rows', () => {
    expect(transformInventoryLevels(makeItem({ stock: [] }))).toEqual([])
    expect(transformInventoryLevels(makeItem({ stock: undefined }))).toEqual([])
  })
})
