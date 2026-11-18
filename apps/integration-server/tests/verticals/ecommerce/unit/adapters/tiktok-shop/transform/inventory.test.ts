/**
 * The fixture is the documented Response Sample of Inventory Search 202309
 * (https://partner.tiktokshop.com/docv2/page/650a9191c16ffe02b8eec161),
 * `data.inventory[0]`, verbatim.
 */
import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevels,
  type RawTikTokProductInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

const DOC_SAMPLE: RawTikTokProductInventory = {
  product_id: '1729592969712207008',
  skus: [
    {
      id: '1729388324987897824',
      seller_sku: 'Color-Red-XM01',
      total_available_quantity: 100,
      total_committed_quantity: 10,
      warehouse_inventory: [
        { warehouse_id: '7054915283043174149', available_quantity: 100, committed_quantity: 10 },
      ],
      total_available_inventory_distribution: {
        campaign_inventory: [{ quantity: 30, campaign_name: 'Big Sale' }],
        creator_inventory: [{ quantity: 20, creator_name: 'py001' }],
        in_shop_inventory: { quantity: 50 },
      },
    },
  ],
}

describe('transformInventoryLevels (TikTok Shop Inventory Search)', () => {
  it('maps the documented sample to one level per SKU per warehouse', () => {
    const rows = transformInventoryLevels(DOC_SAMPLE)
    expect(rows).toHaveLength(1)
    const row = InventoryLevelSchema.parse(rows[0])
    expect(row).toMatchObject({
      id: '1729388324987897824:7054915283043174149',
      variantId: '1729388324987897824',
      locationId: '7054915283043174149',
      available: 100,
      committed: 10,
      onHand: 110,
    })
    expect(row.metadata).toMatchObject({
      productId: '1729592969712207008',
      sellerSku: 'Color-Red-XM01',
    })
  })

  it('emits a row for every warehouse, never an aggregate', () => {
    const rows = transformInventoryLevels({
      product_id: 'p1',
      skus: [
        {
          id: 's1',
          warehouse_inventory: [
            { warehouse_id: 'w1', available_quantity: 3, committed_quantity: 1 },
            { warehouse_id: 'w2', available_quantity: 5, committed_quantity: 0 },
          ],
        },
        { id: 's2', warehouse_inventory: [{ warehouse_id: 'w1', available_quantity: 0 }] },
      ],
    })
    for (const r of rows) InventoryLevelSchema.parse(r)
    expect(rows.map((r) => [r.id, r.available, r.committed])).toEqual([
      ['s1:w1', 3, 1],
      ['s1:w2', 5, 0],
      ['s2:w1', 0, undefined],
    ])
    // committed_quantity absent: neither committed nor onHand is invented.
    expect(rows[2]!.onHand).toBeUndefined()
  })

  it('a SKU with no warehouse_inventory yields no rows, not a zero row', () => {
    expect(transformInventoryLevels({ product_id: 'p1', skus: [{ id: 's1' }] })).toEqual([])
  })

  it('throws rather than inventing a quantity or a warehouse', () => {
    expect(() =>
      transformInventoryLevels({
        skus: [{ id: 's1', warehouse_inventory: [{ warehouse_id: 'w1' }] }],
      }),
    ).toThrow(/available_quantity/)
    expect(() =>
      transformInventoryLevels({
        skus: [{ id: 's1', warehouse_inventory: [{ available_quantity: 1 }] }],
      }),
    ).toThrow(/warehouse_id/)
    expect(() => transformInventoryLevels({ skus: [{ warehouse_inventory: [] }] })).toThrow(/no id/)
  })
})
