import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawOrcaScanRow,
} from '../../../../../../../src/verticals/inventory/adapters/orca-scan/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — orca-scan', () => {
  const raw: RawOrcaScanRow = {
    _id: 'row_001',
    barcode: '012345678901',
    name: 'Blue Pen',
    quantity: 42,
    description: 'A blue ballpoint pen',
    date: '2024-03-01T00:00:00Z',
    location: 'Shelf B',
    _sheetId: 'sheet_abc123',
  }
  const result = transformProduct(raw)

  it('maps id from _id', () => {
    expect(result.id).toBe('row_001')
  })

  it('maps sku from barcode', () => {
    expect(result.sku).toBe('012345678901')
  })

  it('maps upc from barcode', () => {
    expect(result.upc).toBe('012345678901')
  })

  it('maps name from raw.name', () => {
    expect(result.name).toBe('Blue Pen')
  })

  it('maps description from raw.description', () => {
    expect(result.description).toBe('A blue ballpoint pen')
  })

  it('hardcodes unitOfMeasure to each', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('omits retailPrice (Orca Scan has no pricing)', () => {
    expect(result.retailPrice).toBeUndefined()
  })

  it('maps updatedAt from date via toIso', () => {
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to orca-scan', () => {
    expect(result.platform).toBe('orca-scan')
  })

  it('stores sheetId and location in metadata', () => {
    expect(result.metadata['sheetId']).toBe('sheet_abc123')
    expect(result.metadata['location']).toBe('Shelf B')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — orca-scan fallbacks when optional fields absent', () => {
  const raw: RawOrcaScanRow = {
    _id: 'row_minimal',
  }
  const result = transformProduct(raw)

  it('falls back to _id for sku when barcode absent', () => {
    expect(result.sku).toBe('row_minimal')
  })

  it('falls back to _id for name when name and barcode absent', () => {
    expect(result.name).toBe('row_minimal')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — orca-scan quantity as string', () => {
  const raw: RawOrcaScanRow = {
    _id: 'row_str_qty',
    barcode: '999888777',
    quantity: '15',
  }
  const result = transformProduct(raw)

  it('stores parsed quantity string in metadata', () => {
    expect(result.metadata['quantity']).toBe('15')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
