import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawInforWmsSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/infor-wms/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('infor-wms transformSupplier', () => {
  const raw: RawInforWmsSupplier = {
    supplierId: 'SUPP-A',
    supplierName: 'Acme Supplies',
    emailAddress: 'orders@acme.example',
    phoneNumber: '+18005551234',
    currencyCode: 'USD',
    leadTimeDays: 7,
    activeFlag: 'Y',
    ownerCode: 'CORP',
  }

  it('maps id and externalId from supplierId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('SUPP-A')
    expect(result.externalId).toBe('SUPP-A')
  })

  it('maps name from supplierName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Supplies')
  })

  it('maps email from emailAddress', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps phone from phoneNumber', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+18005551234')
  })

  it('maps defaultCurrency from currencyCode', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(7)
  })

  it('maps isActive from Y activeFlag', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps isActive false from N activeFlag', () => {
    const result = transformSupplier({ ...raw, activeFlag: 'N' })
    expect(result.isActive).toBe(false)
  })

  it('falls back name to supplierId when supplierName absent', () => {
    const result = transformSupplier({ supplierId: 'SUPP-X' })
    expect(result.name).toBe('SUPP-X')
  })

  it('sets platform to infor-wms', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('infor-wms')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
