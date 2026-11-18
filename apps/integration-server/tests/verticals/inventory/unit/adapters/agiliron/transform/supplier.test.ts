import { describe, it, expect } from 'vitest'
import { transformVendor } from '../../../../../../../src/verticals/inventory/adapters/agiliron/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformVendor', () => {
  const raw = {
    VendorId: 'VEN-01',
    VendorName: 'Acme Supplies',
    Email: 'orders@acme.example',
    Telephone: '+14155550100',
    DefaultCurrency: 'USD',
  }

  it('maps VendorId and VendorName', () => {
    const result = transformVendor(raw)
    expect(result.id).toBe('VEN-01')
    expect(result.name).toBe('Acme Supplies')
    expect(result.platform).toBe('agiliron')
    expect(result.isActive).toBe(true)
  })

  it('maps email, phone, and currency', () => {
    const result = transformVendor(raw)
    expect(result.email).toBe('orders@acme.example')
    expect(result.phone).toBe('+14155550100')
    expect(result.defaultCurrency).toBe('USD')
  })

  it('falls back to vendor_id and vendor_name for lowercase keys', () => {
    const result = transformVendor({ vendor_id: 'VEN-02', vendor_name: 'Beta Corp' })
    expect(result.id).toBe('VEN-02')
    expect(result.name).toBe('Beta Corp')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformVendor(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
