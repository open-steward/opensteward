import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSageX3StockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/sage-x3-inventory/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('sage-x3-inventory transformStockLevel', () => {
  const raw: RawSageX3StockLevel = {
    ITMREF: 'WK-2026',
    STOFCY: 'PARIS',
    QTYSTU: 100,
    PHYSTU: 98,
    ALLQTY: 8,
    ORDQTY: 50,
    REOSLO: 20,
    REOQUA: 100,
    UPDDAT: '2024-03-01T00:00:00Z',
  }

  it('synthesises id as productId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('WK-2026:PARIS')
  })

  it('maps productId from ITMREF', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('WK-2026')
  })

  it('maps locationId from STOFCY', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('PARIS')
  })

  it('maps quantityOnHand from QTYSTU (primary)', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(100)
  })

  it('falls back quantityOnHand to PHYSTU when QTYSTU absent', () => {
    const result = transformStockLevel({ ...raw, QTYSTU: undefined })
    expect(result.quantityOnHand).toBe(98)
  })

  it('computes quantityAvailable as PHYSTU - ALLQTY', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(90) // 98 - 8
  })

  it('maps quantityCommitted from ALLQTY', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(8)
  })

  it('maps quantityIncoming from ORDQTY', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('maps reorderPoint from REOSLO', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderPoint).toBe(20)
  })

  it('maps reorderQuantity from REOQUA', () => {
    const result = transformStockLevel(raw)
    expect(result.reorderQuantity).toBe(100)
  })

  it('maps lastCountedAt from UPDDAT', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is sage-x3-inventory', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('sage-x3-inventory')
  })

  it('produces output satisfying StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
