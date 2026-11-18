import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawAdvanceProVendor,
} from '../../../../../../../src/verticals/inventory/adapters/advance-pro/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const rawVendor: RawAdvanceProVendor = {
  id: '10',
  name: 'Acme Supplies',
  email: 'orders@acme.example',
  phone: '+14155550100',
  currency: 'USD',
  leadTimeDays: 14,
  isActive: true,
}

describe('transformSupplier', () => {
  it('maps id and name', () => {
    const result = transformSupplier(rawVendor)
    expect(result.id).toBe('10')
    expect(result.name).toBe('Acme Supplies')
  })

  it('maps email, phone, and defaultLeadTimeDays', () => {
    const result = transformSupplier(rawVendor)
    expect(result.email).toBe('orders@acme.example')
    expect(result.phone).toBe('+14155550100')
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('maps platform and isActive', () => {
    const result = transformSupplier(rawVendor)
    expect(result.platform).toBe('advance-pro')
    expect(result.isActive).toBe(true)
  })

  it('maps defaultCurrency', () => {
    const result = transformSupplier(rawVendor)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('passes SupplierSchema validation', () => {
    const result = transformSupplier(rawVendor)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
