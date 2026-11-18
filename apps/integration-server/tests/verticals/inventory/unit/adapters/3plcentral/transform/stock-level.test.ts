import { describe, it, expect } from 'vitest'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/3plcentral/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — detail (per-receipt-lot)', () => {
  const raw = {
    receiveItemId: 200,
    itemIdentifier: { id: 101, sku: 'WK-2026' },
    locationIdentifier: {
      id: 42,
      nameKey: { name: 'BIN-A1' },
    },
    onHandQty: 100,
    availableQty: 90,
  }
  const result = transformStockLevel(raw)

  it('sets id from receiveItemId', () => {
    expect(result.id).toBe('200')
  })

  it('sets quantityOnHand', () => {
    expect(result.quantityOnHand).toBe(100)
  })

  it('sets quantityAvailable', () => {
    expect(result.quantityAvailable).toBe(90)
  })

  it('sets productId', () => {
    expect(result.productId).toBe('101')
  })

  it('sets locationId from locationIdentifier.id', () => {
    expect(result.locationId).toBe('42')
  })

  it('sets platform to 3plcentral', () => {
    expect(result.platform).toBe('3plcentral')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — summary (aggregated per item+facility)', () => {
  const raw = {
    itemIdentifier: { id: 101, sku: 'WK-2026' },
    facilityIdentifier: { id: 1 },
    onHand: 250,
    available: 240,
  }
  const result = transformStockLevel(raw)

  it('sets id as itemId:facilityId', () => {
    expect(result.id).toBe('101:1')
  })

  it('sets quantityOnHand from onHand', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('sets quantityAvailable from available', () => {
    expect(result.quantityAvailable).toBe(240)
  })

  it('sets locationId from facilityIdentifier.id', () => {
    expect(result.locationId).toBe('1')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
