import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawListingMirrorInventory,
} from '../../../../../../../src/verticals/inventory/adapters/listing-mirror/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('listing-mirror transformStockLevel', () => {
  const raw: RawListingMirrorInventory = {
    sku: 'LM-SKU-001',
    quantity: 25,
  }

  it('uses sku as id', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('LM-SKU-001')
  })

  it('uses sku as productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('LM-SKU-001')
  })

  it('hardcodes locationId to "default"', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('default')
  })

  it('maps quantityOnHand from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(25)
  })

  it('defaults quantityOnHand to 0 when quantity is absent', () => {
    const result = transformStockLevel({ ...raw, quantity: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to listing-mirror', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('listing-mirror')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
