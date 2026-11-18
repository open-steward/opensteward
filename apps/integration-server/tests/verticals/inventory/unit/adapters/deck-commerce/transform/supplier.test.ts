import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawDeckCommerceSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/deck-commerce/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('deck-commerce transformSupplier', () => {
  const raw: RawDeckCommerceSupplier = {
    SupplierID: 'dc-sup-001',
    VendorID: 'vendor-001',
    SupplierName: 'Global Goods Inc',
    VendorName: 'Global Goods Vendor',
    Email: 'orders@globalgoods.example',
    Phone: '+12125550100',
    Currency: 'USD',
    LeadTimeDays: 7,
    Status: 'active',
  }

  it('maps id and externalId preferring SupplierID over VendorID', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('dc-sup-001')
    expect(result.externalId).toBe('dc-sup-001')
  })

  it('falls back to VendorID when SupplierID absent', () => {
    const result = transformSupplier({ ...raw, SupplierID: undefined })
    expect(result.id).toBe('vendor-001')
  })

  it('maps name preferring SupplierName over VendorName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Global Goods Inc')
  })

  it('falls back to VendorName when SupplierName absent', () => {
    const result = transformSupplier({ ...raw, SupplierName: undefined })
    expect(result.name).toBe('Global Goods Vendor')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@globalgoods.example')
  })

  it('maps defaultCurrency from Currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from LeadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(7)
  })

  it('sets isActive true when Status is not "inactive"', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when Status is "inactive"', () => {
    const result = transformSupplier({ ...raw, Status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive true when Status is "INACTIVE" (case-insensitive)', () => {
    const result = transformSupplier({ ...raw, Status: 'INACTIVE' })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to deck-commerce', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('deck-commerce')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
