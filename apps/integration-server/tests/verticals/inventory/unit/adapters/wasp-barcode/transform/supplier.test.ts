import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawWaspBarcodeSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/wasp-barcode/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const rawSupplier: RawWaspBarcodeSupplier = {
  VendorNumber: 'VEN-42',
  VendorName: 'Acme Supplies',
  Email: 'orders@acme.example',
  Phone: '+15551234567',
  IsActive: true,
  AccountNumber: 'ACC-001',
}

describe('wasp-barcode transformSupplier', () => {
  it('maps VendorNumber to id', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.id).toBe('VEN-42')
    expect(result.externalId).toBe('VEN-42')
  })

  it('maps VendorName to name', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.name).toBe('Acme Supplies')
  })

  it('maps Email to email', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps Phone to phone', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.phone).toBe('+15551234567')
  })

  it('maps IsActive to isActive', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.isActive).toBe(true)
  })

  it('sets platform=wasp-barcode', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.platform).toBe('wasp-barcode')
  })

  it('stores AccountNumber in metadata', () => {
    const result = transformSupplier(rawSupplier)
    expect(result.metadata['accountNumber']).toBe('ACC-001')
  })

  it('produces a schema-valid Supplier', () => {
    const result = transformSupplier(rawSupplier)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })

  it('defaults isActive=true when IsActive is not provided', () => {
    const result = transformSupplier({ VendorNumber: 'X', VendorName: 'X' })
    expect(result.isActive).toBe(true)
  })

  it('handles IsActive=false correctly', () => {
    const result = transformSupplier({ ...rawSupplier, IsActive: false })
    expect(result.isActive).toBe(false)
  })
})
