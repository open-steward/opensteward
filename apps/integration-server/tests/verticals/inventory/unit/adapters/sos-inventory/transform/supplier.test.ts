import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSosInventoryVendor,
} from '../../../../../../../src/verticals/inventory/adapters/sos-inventory/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('sos-inventory transformSupplier', () => {
  const raw: RawSosInventoryVendor = {
    id: 7,
    name: 'Widget World',
    email: 'orders@widgetworld.example',
    phone: '+19175550177',
    currency: 'USD',
    leadTime: 5,
  }

  it('maps id (numeric) as string and name', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('7')
    expect(result.name).toBe('Widget World')
    expect(result.platform).toBe('sos-inventory')
  })

  it('maps email and phone', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@widgetworld.example')
    expect(result.phone).toBe('+19175550177')
  })

  it('maps defaultCurrency and defaultLeadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
    expect(result.defaultLeadTimeDays).toBe(5)
  })

  it('always sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('emits empty metadata when no extra fields', () => {
    const result = transformSupplier(raw)
    expect(result.metadata).toEqual({})
  })

  it('produces output satisfying SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
