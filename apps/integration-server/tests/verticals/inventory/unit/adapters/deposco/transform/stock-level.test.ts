import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawDeposcoInventory,
} from '../../../../../../../src/verticals/inventory/adapters/deposco/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('deposco transformStockLevel', () => {
  const raw: RawDeposcoInventory = {
    itemNumber: 'DEP-SKU-001',
    facilityNumber: 'FAC-001',
    locationNumber: 'BIN-A1',
    quantityOnHand: 150,
    quantityAvailable: 130,
    quantityCommitted: 20,
    quantityIncoming: 50,
    reorderPoint: 25,
    reorderQuantity: 100,
    lastCycleCountDate: '2024-03-01T00:00:00Z',
  }

  it('builds composite id from itemNumber and compound locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('DEP-SKU-001:FAC-001:BIN-A1')
  })

  it('maps productId from itemNumber', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('DEP-SKU-001')
  })

  it('builds locationId as facilityNumber:locationNumber when both present', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('FAC-001:BIN-A1')
  })

  it('uses facilityNumber as locationId when locationNumber absent', () => {
    const result = transformStockLevel({ ...raw, locationNumber: undefined })
    expect(result.locationId).toBe('FAC-001')
    expect(result.id).toBe('DEP-SKU-001:FAC-001')
  })

  it('maps quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(150)
  })

  it('maps quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(130)
  })

  it('maps quantityCommitted', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(20)
  })

  it('maps quantityIncoming', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint and reorderQuantity', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(25)
    expect(result.reorderQuantity).toBe(100)
  })

  it('maps lastCountedAt from lastCycleCountDate', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults quantityOnHand to 0 when absent', () => {
    const result = transformStockLevel({ itemNumber: 'DEP-SKU-002' })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to deposco', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('deposco')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
