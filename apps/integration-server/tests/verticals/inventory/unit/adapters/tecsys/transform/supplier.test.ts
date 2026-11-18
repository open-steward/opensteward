import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawTecsysSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/tecsys/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

function makeRaw(overrides: Partial<RawTecsysSupplier> = {}): RawTecsysSupplier {
  return {
    VendorId: 'VENDOR-A',
    VendorName: 'Premier Supplies Inc',
    Email: 'orders@premiersupplies.example',
    Phone: '+18005551234',
    Currency: 'USD',
    LeadTimeDays: 5,
    Status: 'Active',
    IsActive: true,
    ...overrides,
  }
}

describe('transformSupplier (tecsys)', () => {
  it('maps id and externalId from VendorId', () => {
    const result = transformSupplier(makeRaw())
    expect(result.id).toBe('VENDOR-A')
    expect(result.externalId).toBe('VENDOR-A')
  })

  it('maps name from VendorName', () => {
    const result = transformSupplier(makeRaw())
    expect(result.name).toBe('Premier Supplies Inc')
  })

  it('maps email and phone', () => {
    const result = transformSupplier(makeRaw())
    expect(result.email).toBe('orders@premiersupplies.example')
    expect(result.phone).toBe('+18005551234')
  })

  it('maps defaultCurrency from Currency', () => {
    const result = transformSupplier(makeRaw())
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from LeadTimeDays', () => {
    const result = transformSupplier(makeRaw({ LeadTimeDays: 5 }))
    expect(result.defaultLeadTimeDays).toBe(5)
  })

  it('isActive is true when IsActive is true', () => {
    const result = transformSupplier(makeRaw({ IsActive: true }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when Status is "inactive" and IsActive is absent', () => {
    const result = transformSupplier(makeRaw({ IsActive: undefined, Status: 'inactive' }))
    expect(result.isActive).toBe(false)
  })

  it('IsActive overrides Status when both are present', () => {
    // pickBool(raw.IsActive) returns false, overriding Status-based fallback
    const result = transformSupplier(makeRaw({ IsActive: false, Status: 'Active' }))
    expect(result.isActive).toBe(false)
  })

  it('platform is "tecsys"', () => {
    const result = transformSupplier(makeRaw())
    expect(result.platform).toBe('tecsys')
  })

  it('passes SupplierSchema validation', () => {
    const result = transformSupplier(makeRaw())
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
