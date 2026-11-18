import { describe, it, expect } from 'vitest'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/orca-scan/transform/stock-level'
import type { RawOrcaScanRow } from '../../../../../../../src/verticals/inventory/adapters/orca-scan/transform/product'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — orca-scan', () => {
  const raw: RawOrcaScanRow = {
    _id: 'row_001',
    barcode: '012345678901',
    quantity: 42,
    date: '2024-03-01T00:00:00Z',
    location: 'Shelf B',
    _sheetId: 'sheet_abc123',
  }
  const result = transformStockLevel(raw)

  it('builds composite id as <_id>:<_sheetId>', () => {
    expect(result.id).toBe('row_001:sheet_abc123')
  })

  it('maps productId from _id', () => {
    expect(result.productId).toBe('row_001')
  })

  it('maps locationId from _sheetId', () => {
    expect(result.locationId).toBe('sheet_abc123')
  })

  it('maps quantityOnHand from quantity', () => {
    expect(result.quantityOnHand).toBe(42)
  })

  it('maps quantityAvailable equal to quantity', () => {
    expect(result.quantityAvailable).toBe(42)
  })

  it('maps lastCountedAt from date via toIso', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to orca-scan', () => {
    expect(result.platform).toBe('orca-scan')
  })

  it('stores barcode in metadata', () => {
    expect(result.metadata['barcode']).toBe('012345678901')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — orca-scan defaults when quantity absent', () => {
  const raw: RawOrcaScanRow = {
    _id: 'row_no_qty',
    _sheetId: 'sheet_xyz',
  }
  const result = transformStockLevel(raw)

  it('defaults quantityOnHand to 0 when quantity absent', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
