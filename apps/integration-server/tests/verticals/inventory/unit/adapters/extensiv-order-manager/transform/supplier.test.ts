import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawExtensivVendor,
} from '../../../../../../../src/verticals/inventory/adapters/extensiv-order-manager/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('extensiv-order-manager transformSupplier', () => {
  const raw: RawExtensivVendor = {
    vendorId: 42,
    name: 'Keyboards Inc',
    active: true,
    supplier: true,
    manufacturer: false,
    dropshipper: false,
    contactEmail: 'orders@keyboards.example',
    contactPhone1: '+14155550199',
    contactPhone2: null,
    website: 'https://keyboards.example',
    fax: null,
    defaultPurchaseOrderFormat: 'PDF',
    address: {
      address1: '100 Vendor Blvd',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      country: 'US',
    },
  }

  it('maps id and externalId from vendorId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps email from contactEmail', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone from contactPhone1', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14155550199')
  })

  it('falls back to contactPhone2 when contactPhone1 is absent', () => {
    const result = transformSupplier({ ...raw, contactPhone1: null, contactPhone2: '+14155550200' })
    expect(result.phone).toBe('+14155550200')
  })

  it('maps isActive from active', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when active is false', () => {
    const result = transformSupplier({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to extensiv-order-manager', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('extensiv-order-manager')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
