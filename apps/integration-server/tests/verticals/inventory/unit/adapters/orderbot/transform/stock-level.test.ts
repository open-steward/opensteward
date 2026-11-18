import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawOrderbotInventory,
} from '../../../../../../../src/verticals/inventory/adapters/orderbot/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — orderbot', () => {
  const raw: RawOrderbotInventory = {
    product_id: 123,
    sku: 'WK-2026',
    distribution_center_id: 7,
    on_hand: 250,
    available: 240,
    committed: 10,
    on_order: 100,
    reorder_point: 50,
    reorder_quantity: 200,
    last_count_date: '2024-03-01T00:00:00Z',
  }
  const result = transformStockLevel(raw)

  it('builds composite id as <productId>:<locationId>', () => {
    expect(result.id).toBe('123:7')
  })

  it('maps productId from product_id as string', () => {
    expect(result.productId).toBe('123')
  })

  it('maps locationId from distribution_center_id as string', () => {
    expect(result.locationId).toBe('7')
  })

  it('maps quantityOnHand from on_hand', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from available', () => {
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from committed', () => {
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from on_order', () => {
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps reorderPoint', () => {
    expect(result.reorderPoint).toBe(50)
  })

  it('maps reorderQuantity', () => {
    expect(result.reorderQuantity).toBe(200)
  })

  it('maps lastCountedAt from last_count_date', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to orderbot', () => {
    expect(result.platform).toBe('orderbot')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — orderbot fallbacks', () => {
  const raw: RawOrderbotInventory = {
    sku: 'BACKUP-SKU',
    distribution_center: 'Main DC',
    on_hand: '0',
    allocated: 3,
    updated_at: '2024-03-01T00:00:00Z',
  }
  const result = transformStockLevel(raw)

  it('falls back to sku for productId when product_id absent', () => {
    expect(result.productId).toBe('BACKUP-SKU')
  })

  it('falls back to distribution_center string for locationId', () => {
    expect(result.locationId).toBe('Main DC')
  })

  it('parses on_hand from string "0"', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('falls back to allocated for quantityCommitted', () => {
    expect(result.quantityCommitted).toBe(3)
  })

  it('falls back to updated_at for lastCountedAt when last_count_date absent', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
