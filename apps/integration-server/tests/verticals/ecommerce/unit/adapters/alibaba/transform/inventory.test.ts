import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawAlibabaInventoryRow,
} from '../../../../../../../src/verticals/ecommerce/adapters/alibaba/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'
import { INVENTORY_GET } from '../fixtures'

const row = INVENTORY_GET.result.data_list[0] as unknown as RawAlibabaInventoryRow

describe('alibaba transformInventoryLevel (documented inventory.get row)', () => {
  it('keys the level by sku_id and inventory_code and parses', () => {
    const l = InventoryLevelSchema.parse(transformInventoryLevel(row, '78653923223'))
    expect(l).toMatchObject({
      id: '33323:CN_LOCAL_01',
      variantId: '33323',
      locationId: 'CN_LOCAL_01',
      available: 100,
    })
    expect(l.metadata['productId']).toBe('78653923223')
    expect(l.committed).toBeUndefined()
    expect(l.onHand).toBeUndefined()
  })

  it.each([
    ['sku_id', { ...row, sku_id: undefined }],
    ['inventory_code', { ...row, inventory_code: undefined }],
    ['inventory', { ...row, inventory: undefined }],
    ['a fractional inventory', { ...row, inventory: '2.5' }],
    // InventoryLevelSchema: available is z.number().int().min(0).
    ['a negative inventory', { ...row, inventory: '-1' }],
  ])('refuses a row missing %s instead of filling it in', (_what, bad) => {
    expect(() => transformInventoryLevel(bad as RawAlibabaInventoryRow, 'p')).toThrow(/lacks/)
  })
})
