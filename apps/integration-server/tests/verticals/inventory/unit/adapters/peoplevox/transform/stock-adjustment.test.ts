import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawPeoplevoxStockAdjustment,
} from '../../../../../../../src/verticals/inventory/adapters/peoplevox/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — peoplevox', () => {
  const raw: RawPeoplevoxStockAdjustment = {
    History_Id: 'HID-001',
    Item_code: 'WK-2026',
    Item_name: 'Wireless Keyboard',
    Date_timestamp: '2024-03-01T00:00:00Z',
    User: 'jane.doe',
    From: 'WH-MAIN',
    To: 'WH-MAIN',
    Quantity: '-5',
    Comments: 'Damaged during shipping',
    Site_reference: 'SITE-A',
    Register_Reason: 'damage',
  }
  const result = transformStockAdjustment(raw)

  it('maps id from History_Id', () => {
    expect(result.id).toBe('HID-001')
  })

  it('maps locationId from Site_reference', () => {
    expect(result.locationId).toBe('SITE-A')
  })

  it('maps reason damage from "damage"', () => {
    expect(result.reason).toBe('damage')
  })

  it('maps line productId from Item_code', () => {
    expect(result.lines[0]!.productId).toBe('WK-2026')
  })

  it('maps line deltaQuantity from Quantity (negative)', () => {
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
  })

  it('maps line notes from Comments', () => {
    expect(result.lines[0]!.notes).toBe('Damaged during shipping')
  })

  it('maps adjustedAt from Date_timestamp via toIso', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps adjustedBy from User', () => {
    expect(result.adjustedBy).toBe('jane.doe')
  })

  it('sets platform to peoplevox', () => {
    expect(result.platform).toBe('peoplevox')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — peoplevox reason mapping', () => {
  const cases: Array<[string, string]> = [
    ['stocktake', 'cycle_count'],
    ['cycle count', 'cycle_count'],
    ['damaged goods', 'damage'],
    ['theft', 'theft'],
    ['stolen', 'theft'],
    ['lost', 'lost'],
    ['found', 'found'],
    ['expiration', 'expiration'],
    ['correction entry', 'correction'],
    ['miscellaneous', 'other'],
  ]

  for (const [reason, expected] of cases) {
    it(`maps reason "${reason}" → "${expected}"`, () => {
      const raw: RawPeoplevoxStockAdjustment = {
        History_Id: 'H1',
        Item_code: 'SKU-1',
        Date_timestamp: '2024-03-01T00:00:00Z',
        Site_reference: 'SITE-1',
        Register_Reason: reason,
        Quantity: '0',
      }
      expect(transformStockAdjustment(raw).reason).toBe(expected)
    })
  }
})

describe('transformStockAdjustment — peoplevox fallbacks', () => {
  it('builds synthetic id from Item_code and Date_timestamp when History_Id absent', () => {
    const raw: RawPeoplevoxStockAdjustment = {
      Item_code: 'SKU-X',
      Date_timestamp: '2024-03-01T00:00:00Z',
      Quantity: '1',
      From: 'LOC-FROM',
    }
    const result = transformStockAdjustment(raw)
    expect(result.id).toBe('SKU-X:2024-03-01T00:00:00Z')
  })

  it('falls back to From for locationId when Site_reference absent', () => {
    const raw: RawPeoplevoxStockAdjustment = {
      History_Id: 'H2',
      Item_code: 'SKU-Y',
      Date_timestamp: '2024-03-01T00:00:00Z',
      From: 'LOC-FROM',
      Quantity: '2',
    }
    const result = transformStockAdjustment(raw)
    expect(result.locationId).toBe('LOC-FROM')
  })

  it('produces empty lines when Item_code absent', () => {
    const raw: RawPeoplevoxStockAdjustment = {
      History_Id: 'H3',
      Date_timestamp: '2024-03-01T00:00:00Z',
      Site_reference: 'SITE-1',
      Quantity: '0',
    }
    const result = transformStockAdjustment(raw)
    expect(result.lines).toEqual([])
  })

  it('passes schema validation', () => {
    const raw: RawPeoplevoxStockAdjustment = {
      History_Id: 'H4',
      Item_code: 'SKU-Z',
      Date_timestamp: '2024-03-01T00:00:00Z',
      Site_reference: 'SITE-1',
      Quantity: '5',
    }
    expect(() => StockAdjustmentSchema.parse(transformStockAdjustment(raw))).not.toThrow()
  })
})
