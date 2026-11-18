import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawKoronaPosProductStock,
} from '../../../../../../../src/verticals/inventory/adapters/korona-pos/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('korona-pos transformStockLevel', () => {
  const raw: RawKoronaPosProductStock = {
    product: { id: 'prod-uuid-001', number: 'SKU-001' },
    warehouse: { id: 'wh-uuid-001', number: 'WH-001' },
    amount: {
      actual: 100,
      lent: 5,
      maxLevel: 200,
      ordered: 50,
      reorderLevel: 20,
    },
    averagePurchasePrice: 9.99,
    revision: 3,
  }

  it('builds composite id from productId and locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('prod-uuid-001:wh-uuid-001')
  })

  it('maps productId from product.id', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('prod-uuid-001')
  })

  it('maps locationId from warehouse.id', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('wh-uuid-001')
  })

  it('maps quantityOnHand from amount.actual', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('defaults quantityOnHand to 0 when amount.actual missing', () => {
    const result = transformStockLevel({ product: { id: 'x' }, warehouse: { id: 'y' } })
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps quantityCommitted from amount.lent', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(5)
  })

  it('maps quantityIncoming from amount.ordered', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint from amount.reorderLevel', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(20)
  })

  it('quantityAvailable is undefined (not provided by KORONA)', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('lastCountedAt is undefined (not provided by KORONA)', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBeUndefined()
  })

  it('sets platform to korona-pos', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('korona-pos')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
