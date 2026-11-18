import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawKladanaStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/kladana/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('kladana transformStockLevel', () => {
  const raw: RawKladanaStockLevel = {
    assortmentId: 'prod-uuid-001',
    storeId: 'store-uuid-001',
    stock: 100,
    reserve: 15,
    inTransit: 25,
    quantity: 85,
  }

  it('builds composite id from assortmentId and storeId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('prod-uuid-001:store-uuid-001')
  })

  it('maps productId from assortmentId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('prod-uuid-001')
  })

  it('maps locationId from storeId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('store-uuid-001')
  })

  it('maps quantityOnHand from stock', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('defaults quantityOnHand to 0 when stock is missing', () => {
    const result = transformStockLevel({ assortmentId: 'x', stock: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps quantityAvailable from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(85)
  })

  it('maps quantityCommitted from reserve', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(15)
  })

  it('maps quantityIncoming from inTransit', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(25)
  })

  it('uses empty string for locationId when storeId is missing', () => {
    const result = transformStockLevel({ assortmentId: 'x', storeId: undefined })
    expect(result.locationId).toBe('')
    expect(result.id).toBe('x:')
  })

  it('sets platform to kladana', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('kladana')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
