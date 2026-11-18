import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSosInventoryStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/sos-inventory/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('sos-inventory transformStockLevel', () => {
  const raw: RawSosInventoryStockLevel = {
    id: 99,
    onhand: 200,
    available: 180,
    onSO: 20,
    onPO: 100,
    reorderPoint: 50,
    maxStock: 500,
    _locationId: 'loc-5',
  }

  it('uses item id as productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('99')
    expect(result.platform).toBe('sos-inventory')
  })

  it('uses _locationId injected by adapter', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('loc-5')
  })

  it('synthesises composite id as "productId:locationId"', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('99:loc-5')
  })

  it('uses productId alone as id when _locationId is absent', () => {
    const { _locationId: _, ...noLoc } = raw
    const result = transformStockLevel(noLoc)
    expect(result.id).toBe('99')
    expect(result.locationId).toBe('')
  })

  it('maps quantityOnHand from onhand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(200)
  })

  it('maps quantityAvailable from available', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(180)
  })

  it('maps quantityCommitted from onSO', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(20)
  })

  it('maps quantityIncoming from onPO', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('maps reorderPoint', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(50)
  })

  it('stores maxStock in metadata', () => {
    const result = transformStockLevel(raw)
    expect(result.metadata['maxStock']).toBe('500')
  })

  it('produces output satisfying StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
