import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawOpenboxesStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/openboxes/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('openboxes transformStockLevel', () => {
  const raw: RawOpenboxesStockLevel = {
    id: 'ii-001',
    product: { id: 'prod-001', productCode: 'WK-2026', name: 'Wireless Keyboard' },
    inventoryItem: {
      id: 'ii-001',
      lotNumber: 'LOT-001',
      expirationDate: '2024-03-01T00:00:00Z',
    },
    location: { id: 'loc-001', name: 'Main Warehouse' },
    quantityAvailable: 240,
    quantityOnHand: 250,
    quantity: 250,
  }

  it('synthesises id from productId:locationId:rawId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('prod-001:loc-001:ii-001')
  })

  it('maps productId from product.id', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('prod-001')
  })

  it('maps locationId from location.id', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('loc-001')
  })

  it('maps quantityOnHand from quantityOnHand field', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps lastCountedAt from inventoryItem.expirationDate', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to openboxes', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('openboxes')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
