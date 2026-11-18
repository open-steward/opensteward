/** stock.location rows; fields from addons/stock/models/stock_location.py, 19.0. */
import { describe, expect, it } from 'vitest'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'
import { transformLocation } from '../../../../../../../src/verticals/inventory/adapters/odoo-inventory/transform/location'

const base = {
  id: 8,
  name: 'Stock',
  complete_name: 'WH/Stock',
  location_id: [7, 'WH'] as [number, string],
  active: true,
  warehouse_id: [1, 'San Francisco'] as [number, string],
  barcode: 'WH-STOCK',
}

describe('odoo-inventory transformLocation', () => {
  it('maps an internal location', () => {
    const l = LocationSchema.parse(transformLocation({ ...base, usage: 'internal' }))
    expect(l).toMatchObject({
      id: '8',
      externalId: '8',
      name: 'WH/Stock',
      type: 'warehouse',
      parentLocationId: '7',
      isActive: true,
      platform: 'odoo-inventory',
    })
    expect(l.metadata).toEqual({ usage: 'internal', warehouseId: '1', barcode: 'WH-STOCK' })
  })

  it.each([
    ['transit', 'transit'],
    ['supplier', 'supplier'],
    ['view', 'virtual'],
    ['customer', 'virtual'],
    ['inventory', 'virtual'],
    ['production', 'virtual'],
  ])('usage %s is %s', (usage, type) => {
    expect(LocationSchema.parse(transformLocation({ ...base, usage })).type).toBe(type)
  })

  it('falls back to name when complete_name is empty and has no parent', () => {
    const l = LocationSchema.parse(
      transformLocation({
        ...base,
        usage: 'view',
        complete_name: false,
        location_id: false,
        warehouse_id: false,
        barcode: false,
      }),
    )
    expect(l.name).toBe('Stock')
    expect(l.parentLocationId).toBeUndefined()
    expect(l.metadata).toEqual({ usage: 'view' })
  })
})

describe('odoo-inventory transformLocation isActive', () => {
  it('is active only when Odoo says active is true', () => {
    const { active: _a, ...noActive } = { ...base, usage: 'internal' } as Record<string, unknown>
    expect(transformLocation(noActive as never).isActive).toBe(false)
  })
})
