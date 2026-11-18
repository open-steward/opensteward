import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawDeposcoVendor,
} from '../../../../../../../src/verticals/inventory/adapters/deposco/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('deposco transformSupplier', () => {
  const raw: RawDeposcoVendor = {
    vendorNumber: 'vendor-001',
    vendorName: 'FastenersCo',
    email: 'orders@fasteners.example',
    phone: '+14045550123',
    currency: 'USD',
    leadTime: 5,
    active: 'Y',
  }

  it('maps id and externalId from vendorNumber', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('vendor-001')
    expect(result.externalId).toBe('vendor-001')
  })

  it('maps name from vendorName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('FastenersCo')
  })

  it('falls back to vendorNumber when vendorName absent', () => {
    const result = transformSupplier({ vendorNumber: 'vendor-002' })
    expect(result.name).toBe('vendor-002')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@fasteners.example')
  })

  it('maps phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14045550123')
  })

  it('maps defaultCurrency from currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from leadTime', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(5)
  })

  it('maps isActive from "Y" string', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false for "N"', () => {
    const result = transformSupplier({ ...raw, active: 'N' })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when active absent', () => {
    const result = transformSupplier({ vendorNumber: 'vendor-003' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to deposco', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('deposco')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
