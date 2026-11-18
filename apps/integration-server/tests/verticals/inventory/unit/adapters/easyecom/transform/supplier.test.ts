import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawEasyEcomSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/easyecom/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('easyecom transformSupplier', () => {
  const raw: RawEasyEcomSupplier = {
    vendor_id: 'VEN-001',
    vendor_name: 'Textile Supplier Co',
    vendor_email: 'orders@textilesupplier.example',
    vendor_phone: '+912022345678',
    currency: 'INR',
    lead_time: 5,
    status: 'active',
    is_active: true,
  }

  it('maps id and externalId from vendor_id as string', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('VEN-001')
    expect(result.externalId).toBe('VEN-001')
  })

  it('maps name from vendor_name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Textile Supplier Co')
  })

  it('maps email from vendor_email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@textilesupplier.example')
  })

  it('maps phone from vendor_phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+912022345678')
  })

  it('maps defaultCurrency from currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('INR')
  })

  it('maps defaultLeadTimeDays from lead_time', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(5)
  })

  it('sets isActive true when is_active is true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when is_active is false', () => {
    const result = transformSupplier({ ...raw, is_active: false })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive false when is_active is 0', () => {
    const result = transformSupplier({ ...raw, is_active: 0 })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive true when is_active is 1', () => {
    const result = transformSupplier({ ...raw, is_active: 1 })
    expect(result.isActive).toBe(true)
  })

  it('falls back to status check when is_active absent', () => {
    const result = transformSupplier({ ...raw, is_active: undefined, status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('stores status in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata.status).toBe('active')
  })

  it('sets platform to easyecom', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('easyecom')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
