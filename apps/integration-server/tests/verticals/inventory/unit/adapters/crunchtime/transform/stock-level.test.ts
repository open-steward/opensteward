import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawCrunchtimeCurrentInventory,
} from '../../../../../../../src/verticals/inventory/adapters/crunchtime/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('crunchtime transformStockLevel', () => {
  it('constructs composite id from productNumber and locationCode', () => {
    const raw: RawCrunchtimeCurrentInventory = {
      productNumber: 'PN-100',
      locationCode: 'LOC-001',
      currentQuantity: 50,
    }
    const result = transformStockLevel(raw)

    expect(result.id).toBe('PN-100:LOC-001')
    expect(result.productId).toBe('PN-100')
    expect(result.locationId).toBe('LOC-001')
  })

  it('falls back to empty string locationId when locationCode is absent', () => {
    const raw: RawCrunchtimeCurrentInventory = { productNumber: 'PN-101' }
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('')
    expect(result.id).toBe('PN-101:')
  })

  it('maps currentQuantity to quantityOnHand', () => {
    const raw: RawCrunchtimeCurrentInventory = {
      productNumber: 'PN-102',
      locationCode: 'LOC-001',
      currentQuantity: 125,
    }
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(125)
  })

  it('defaults quantityOnHand to 0 when currentQuantity is absent', () => {
    const raw: RawCrunchtimeCurrentInventory = { productNumber: 'PN-103' }
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(0)
  })

  it('maps minPar to reorderPoint', () => {
    const raw: RawCrunchtimeCurrentInventory = {
      productNumber: 'PN-104',
      locationCode: 'LOC-001',
      minPar: 20,
    }
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(20)
  })

  it('maps lastCountDate to lastCountedAt', () => {
    const raw: RawCrunchtimeCurrentInventory = {
      productNumber: 'PN-105',
      locationCode: 'LOC-001',
      lastCountDate: '2024-03-01T00:00:00Z',
    }
    const result = transformStockLevel(raw)
    // toIso normalises via new Date().toISOString() which may append milliseconds
    expect(result.lastCountedAt).toContain('2024-03-01')
  })

  it('stores maxPar and unitCost as strings in metadata', () => {
    const raw: RawCrunchtimeCurrentInventory = {
      productNumber: 'PN-106',
      locationCode: 'LOC-001',
      maxPar: 100,
      unitCost: 3.75,
    }
    const result = transformStockLevel(raw)
    expect(result.metadata['maxPar']).toBe('100')
    expect(result.metadata['unitCost']).toBe('3.75')
  })

  it('sets platform to crunchtime', () => {
    const raw: RawCrunchtimeCurrentInventory = { productNumber: 'PN-107' }
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('crunchtime')
  })

  it('passes StockLevelSchema validation', () => {
    const raw: RawCrunchtimeCurrentInventory = {
      productNumber: 'PN-FULL',
      locationCode: 'LOC-001',
      currentQuantity: 75,
      minPar: 20,
      maxPar: 150,
      unitCost: 4.99,
      lastCountDate: '2024-03-01T00:00:00Z',
    }
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
