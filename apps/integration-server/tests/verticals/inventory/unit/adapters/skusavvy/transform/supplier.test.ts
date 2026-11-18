import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSkusavvyVendor,
} from '../../../../../../../src/verticals/inventory/adapters/skusavvy/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('skusavvy transformSupplier', () => {
  const raw: RawSkusavvyVendor = {
    id: 'vendor-42',
    name: 'Keyboards Inc',
    email: 'orders@keyboards.example',
    phone: '+14155550199',
    currency: 'USD',
    leadTime: 7,
    status: 'active',
  }

  it('maps id and name', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('vendor-42')
    expect(result.name).toBe('Keyboards Inc')
    expect(result.platform).toBe('skusavvy')
  })

  it('maps email and phone', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@keyboards.example')
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency and defaultLeadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
    expect(result.defaultLeadTimeDays).toBe(7)
  })

  it('sets isActive=true when status is not "inactive"', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive=false when status is "inactive"', () => {
    const result = transformSupplier({ ...raw, status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('produces output satisfying SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
