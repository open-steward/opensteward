import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawCrunchtimeVendor,
} from '../../../../../../../src/verticals/inventory/adapters/crunchtime/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('crunchtime transformSupplier', () => {
  it('uses vendorCode as id and externalId', () => {
    const raw: RawCrunchtimeVendor = {
      vendorCode: 'VEN-001',
      vendorName: 'Bread Supplier Inc',
    }
    const result = transformSupplier(raw)

    expect(result.id).toBe('VEN-001')
    expect(result.externalId).toBe('VEN-001')
  })

  it('maps vendorName to name', () => {
    const raw: RawCrunchtimeVendor = {
      vendorCode: 'VEN-002',
      vendorName: 'Dairy Co',
    }
    const result = transformSupplier(raw)
    expect(result.name).toBe('Dairy Co')
  })

  it('falls back to vendorCode when vendorName is absent', () => {
    const raw: RawCrunchtimeVendor = { vendorCode: 'VEN-003' }
    const result = transformSupplier(raw)
    expect(result.name).toBe('VEN-003')
  })

  it('maps boolean activeFlag to isActive', () => {
    const rawActive: RawCrunchtimeVendor = { vendorCode: 'VEN-004', activeFlag: true }
    const rawInactive: RawCrunchtimeVendor = { vendorCode: 'VEN-005', activeFlag: false }
    expect(transformSupplier(rawActive).isActive).toBe(true)
    expect(transformSupplier(rawInactive).isActive).toBe(false)
  })

  it('defaults isActive to true when activeFlag is absent', () => {
    const raw: RawCrunchtimeVendor = { vendorCode: 'VEN-006' }
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('stores lastEditUser in metadata', () => {
    const raw: RawCrunchtimeVendor = {
      vendorCode: 'VEN-007',
      lastEditUser: 'admin',
    }
    const result = transformSupplier(raw)
    expect(result.metadata['lastEditUser']).toBe('admin')
  })

  it('stores ISO-formatted createDate and lastEditDate in metadata', () => {
    const raw: RawCrunchtimeVendor = {
      vendorCode: 'VEN-008',
      createDate: '2024-03-01T00:00:00Z',
      lastEditDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSupplier(raw)
    // toIso normalises via new Date().toISOString() which may append milliseconds
    expect(result.metadata['createDate']).toContain('2024-03-01')
    expect(result.metadata['lastEditDate']).toContain('2024-03-01')
  })

  it('sets platform to crunchtime', () => {
    const raw: RawCrunchtimeVendor = { vendorCode: 'VEN-009' }
    const result = transformSupplier(raw)
    expect(result.platform).toBe('crunchtime')
  })

  it('passes SupplierSchema validation', () => {
    const raw: RawCrunchtimeVendor = {
      vendorCode: 'VEN-FULL',
      vendorName: 'Full Vendor Corp',
      activeFlag: true,
      createDate: '2024-03-01T00:00:00Z',
      lastEditDate: '2024-03-01T00:00:00Z',
      lastEditUser: 'sysadmin',
    }
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
