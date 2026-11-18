import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawVersaSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/versa-cloud-erp/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const baseRaw: RawVersaSupplier = {
  id: 'vendor-001',
  vendor_name: 'Keyboards Inc',
  email: 'orders@keyboards.example',
  phone: '+14155550199',
  currency: 'USD',
  lead_time_days: 14,
  is_active: true,
}

describe('versa-cloud-erp transformSupplier', () => {
  it('maps id from id field', () => {
    expect(transformSupplier(baseRaw).id).toBe('vendor-001')
  })

  it('maps name from vendor_name', () => {
    expect(transformSupplier(baseRaw).name).toBe('Keyboards Inc')
  })

  it('maps email from email field', () => {
    expect(transformSupplier(baseRaw).email).toBe('orders@keyboards.example')
  })

  it('maps phone from phone field', () => {
    expect(transformSupplier(baseRaw).phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from currency', () => {
    expect(transformSupplier(baseRaw).defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from lead_time_days', () => {
    expect(transformSupplier(baseRaw).defaultLeadTimeDays).toBe(14)
  })

  it('maps isActive from is_active', () => {
    expect(transformSupplier(baseRaw).isActive).toBe(true)
    expect(transformSupplier({ ...baseRaw, is_active: false }).isActive).toBe(false)
  })

  it('sets platform to versa-cloud-erp', () => {
    expect(transformSupplier(baseRaw).platform).toBe('versa-cloud-erp')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(baseRaw))).not.toThrow()
  })
})
