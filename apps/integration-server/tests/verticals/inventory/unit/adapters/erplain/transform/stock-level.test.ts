/**
 * Fixture from the StockLevels example selection and "Available fields" of
 * https://erplain.readme.io/v2.0/reference/stock-levels-queries, with
 * variant.product from /v2.0/reference/variants-queries ("Parent product link.").
 */
import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawErplainStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/erplain/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const raw: RawErplainStockLevel = {
  id: 200050,
  on_hand: 25,
  available: 20,
  incoming: 10,
  reserved: 5,
  reorder_point: 8,
  bin_location: 'A1',
  to_reorder: 0,
  location: { id: 100, label: 'Main Warehouse' },
  variant: { id: 5001, sku: 'SKU-RED', product: { id: 100050 } },
}

describe('erplain transformStockLevel', () => {
  it('parses against the canonical StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })

  it('maps the documented quantities', () => {
    const s = StockLevelSchema.parse(transformStockLevel(raw))
    expect(s.id).toBe('200050')
    expect(s.externalId).toBe('200050')
    expect(s.productId).toBe('100050')
    expect(s.locationId).toBe('100')
    expect(s.quantityOnHand).toBe(25)
    expect(s.quantityAvailable).toBe(20)
    expect(s.quantityCommitted).toBe(5)
    expect(s.quantityIncoming).toBe(10)
    expect(s.reorderPoint).toBe(8)
    expect(s.reorderQuantity).toBeUndefined()
    expect(s.metadata).toMatchObject({
      variant_id: '5001',
      variant_sku: 'SKU-RED',
      location_label: 'Main Warehouse',
      bin_location: 'A1',
      to_reorder: '0',
    })
  })

  it('throws instead of inventing an on-hand quantity', () => {
    expect(() => transformStockLevel({ ...raw, on_hand: null })).toThrow(/on_hand/)
  })

  it('throws instead of inventing a product or location id', () => {
    expect(() => transformStockLevel({ ...raw, variant: { id: 5001, product: null } })).toThrow(
      /variant\.product/,
    )
    expect(() => transformStockLevel({ ...raw, location: null })).toThrow(/location/)
  })
})
