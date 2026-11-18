import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawD365Vendor,
} from '../../../../../../../src/verticals/inventory/adapters/dynamics-365-scm/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('dynamics-365-scm transformSupplier', () => {
  const raw: RawD365Vendor = {
    VendorAccountNumber: 'VENDOR-001',
    VendorName: 'Acme Supplies',
    VendorGroupId: 'DOM',
    CurrencyCode: 'USD',
    VendorHoldStatus: 'None',
    Email: 'orders@acme.example',
    PhoneNumber: '+12065550100',
    DataAreaId: 'USMF',
    DeliveryTermsId: 'FOB',
    PaymentTermsId: 'NET30',
    DefaultLeadTimeDays: 14,
  }

  it('maps id and externalId from VendorAccountNumber', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('VENDOR-001')
    expect(result.externalId).toBe('VENDOR-001')
  })

  it('maps name from VendorName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Supplies')
  })

  it('falls back to VendorAccountNumber for name when VendorName absent', () => {
    const result = transformSupplier({ ...raw, VendorName: undefined })
    expect(result.name).toBe('VENDOR-001')
  })

  it('maps email from Email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps phone from PhoneNumber', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+12065550100')
  })

  it('maps defaultCurrency from CurrencyCode', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from DefaultLeadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('sets isActive true when VendorHoldStatus is None', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when VendorHoldStatus is All', () => {
    const result = transformSupplier({ ...raw, VendorHoldStatus: 'All' })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive false when VendorHoldStatus is Vendor', () => {
    const result = transformSupplier({ ...raw, VendorHoldStatus: 'Vendor' })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to dynamics-365-scm', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('dynamics-365-scm')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
