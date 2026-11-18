import { describe, it, expect } from 'vitest'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/agiliron/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel', () => {
  const raw = {
    ProductCode: 'WK-2026',
    StockLocation: 'Warehouse A',
    QtyInStock: 100,
    QtyOnPO: 50,
    QtyOnSO: 10,
    ModifiedTimeUTC: '2024-03-01T00:00:00Z',
  }

  it('builds composite id from ProductCode and StockLocation', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('WK-2026:Warehouse A')
    expect(result.productId).toBe('WK-2026')
    expect(result.locationId).toBe('Warehouse A')
    expect(result.platform).toBe('agiliron')
  })

  it('maps quantity fields correctly', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
    // quantityAvailable = quantityOnHand - quantityCommitted (QtyOnSO) = 100 - 10 = 90
    expect(result.quantityAvailable).toBe(90)
    expect(result.quantityIncoming).toBe(50)
    expect(result.quantityCommitted).toBe(10)
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })

  it('leaves quantityAvailable undefined when neither QtyOnPO nor QtyOnSO is provided', () => {
    const result = transformStockLevel({ ProductCode: 'WK-2026', QtyInStock: 50 })
    expect(result.quantityAvailable).toBeUndefined()
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
