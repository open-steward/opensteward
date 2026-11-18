import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawStockTrimSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/stocktrim/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — stocktrim', () => {
  const raw: RawStockTrimSupplier = {
    supplierCode: 'SUPP-10',
    supplierName: 'Keyboards Inc',
  }
  const result = transformSupplier(raw)

  it('maps id from supplierCode', () => {
    expect(result.id).toBe('SUPP-10')
  })

  it('maps externalId from supplierCode', () => {
    expect(result.externalId).toBe('SUPP-10')
  })

  it('maps name from supplierName', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to stocktrim', () => {
    expect(result.platform).toBe('stocktrim')
  })

  it('email is undefined (not in StockTrim source)', () => {
    expect(result.email).toBeUndefined()
  })

  it('phone is undefined (not in StockTrim source)', () => {
    expect(result.phone).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — stocktrim name fallback to supplierCode', () => {
  const raw: RawStockTrimSupplier = { supplierCode: 'SUPP-BARE' }
  const result = transformSupplier(raw)

  it('falls back name to supplierCode when supplierName absent', () => {
    expect(result.name).toBe('SUPP-BARE')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
