import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawOngoingWmsSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/ongoing-wms/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('ongoing-wms transformSupplier', () => {
  const raw: RawOngoingWmsSupplier = {
    supplierNumber: 'SUP-99',
    supplierName: 'Keyboards Inc',
    supplierArticleNumber: 'KBD-001',
  }

  it('maps id and externalId from supplierNumber', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('SUP-99')
    expect(result.externalId).toBe('SUP-99')
  })

  it('maps name from supplierName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to ongoing-wms', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('ongoing-wms')
  })

  it('stores supplierArticleNumber in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata.supplierArticleNumber).toBe('KBD-001')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
