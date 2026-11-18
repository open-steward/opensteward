import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawBoxstormInventory,
} from '../../../../../../../src/verticals/inventory/adapters/boxstorm/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('boxstorm transformStockLevel', () => {
  const raw: RawBoxstormInventory = {
    id: 101,
    partNumber: 'WDG-001',
    partDescription: 'Widget Alpha',
    quantity: 50,
    uom: { id: 1, name: 'Each', abbreviation: 'EA' },
    location: { id: 5, name: 'Main Warehouse' },
  }

  it('synthesises id from partId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('101:5')
  })

  it('maps productId from id as string', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('101')
  })

  it('maps locationId from location object id', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('5')
  })

  it('accepts location as a string', () => {
    const result = transformStockLevel({ ...raw, location: 'Bin A' })
    expect(result.locationId).toBe('Bin A')
    expect(result.id).toBe('101:Bin A')
  })

  it('maps quantityOnHand from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(50)
  })

  it('defaults quantityOnHand to 0 when quantity absent', () => {
    const result = transformStockLevel({ ...raw, quantity: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to boxstorm', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('boxstorm')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
