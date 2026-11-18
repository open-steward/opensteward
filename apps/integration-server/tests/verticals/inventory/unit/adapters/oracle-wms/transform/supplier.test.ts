import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawOracleWmsVendor,
} from '../../../../../../../src/verticals/inventory/adapters/oracle-wms/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('oracle-wms transformSupplier', () => {
  const raw: RawOracleWmsVendor = {
    vendor_id: 99,
    vendor_name: 'Keyboards Inc',
    vendor_code: 'KBD',
    email: 'orders@keyboards.example',
    phone: '+14155550199',
    currency_code: 'USD',
    lead_time: 14,
    status: 'Active',
    company_id: 1,
  }

  it('maps id and externalId from vendor_id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('maps name from vendor_name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from currency_code', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from lead_time', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('sets isActive true when status is Active', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is Inactive', () => {
    const result = transformSupplier({ ...raw, status: 'Inactive' })
    expect(result.isActive).toBe(false)
  })

  it('stores vendor_code in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata.vendorCode).toBe('KBD')
  })

  it('sets platform to oracle-wms', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('oracle-wms')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
