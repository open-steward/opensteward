import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawBooqableStockItem,
} from '../../../../../../../src/verticals/inventory/adapters/booqable/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('booqable transformStockLevel', () => {
  const raw: RawBooqableStockItem = {
    id: 'si-001',
    type: 'stock_items',
    attributes: {
      id: 'si-001',
      product_id: 'prod-001',
      location_id: 'loc-001',
      identifier: 'SN-001',
      status: 'available',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    },
  }

  it('maps id from resource id', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('si-001')
  })

  it('maps productId from product_id', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('prod-001')
  })

  it('maps locationId from location_id', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('loc-001')
  })

  it('sets quantityOnHand to 1', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(1)
  })

  it('sets quantityAvailable to 1 when status is available', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(1)
  })

  it('sets quantityAvailable to 0 when status is unavailable', () => {
    const result = transformStockLevel({
      ...raw,
      attributes: { ...raw.attributes, status: 'unavailable' },
    })
    expect(result.quantityAvailable).toBe(0)
  })

  it('maps lastCountedAt from updated_at', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to booqable', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('booqable')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
