import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawWebgilityVendor,
} from '../../../../../../../src/verticals/inventory/adapters/webgility/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const rawVendor: RawWebgilityVendor = {
  VendorId: 'vendor-77',
  VendorName: 'Acme Supplies Co',
  CompanyName: 'Acme Supplies Co',
  IsActive: true,
  EmailAddress: 'orders@acme.example',
  Website: 'https://acme.example',
  Phones: [
    { PhoneType: 'PrimaryPhone', FullPhoneNumber: '+15559876543' },
    { PhoneType: 'Fax', FullPhoneNumber: '+15559876544' },
  ],
  Addresses: [
    {
      AddressType: 'Billing',
      AddressLine1: '100 Main St',
      City: 'Denver',
      Region: 'CO',
      PostalCode: '80203',
      Country: 'US',
    },
  ],
}

describe('webgility transformSupplier', () => {
  it('maps VendorId to id', () => {
    const result = transformSupplier(rawVendor)
    expect(result.id).toBe('vendor-77')
    expect(result.externalId).toBe('vendor-77')
  })

  it('maps VendorName to name', () => {
    const result = transformSupplier(rawVendor)
    expect(result.name).toBe('Acme Supplies Co')
  })

  it('maps EmailAddress to email', () => {
    const result = transformSupplier(rawVendor)
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps PrimaryPhone FullPhoneNumber to phone', () => {
    const result = transformSupplier(rawVendor)
    expect(result.phone).toBe('+15559876543')
  })

  it('maps IsActive to isActive', () => {
    const result = transformSupplier(rawVendor)
    expect(result.isActive).toBe(true)
  })

  it('sets platform=webgility', () => {
    const result = transformSupplier(rawVendor)
    expect(result.platform).toBe('webgility')
  })

  it('stores website in metadata', () => {
    const result = transformSupplier(rawVendor)
    expect(result.metadata['website']).toBe('https://acme.example')
  })

  it('stores billing city in metadata', () => {
    const result = transformSupplier(rawVendor)
    expect(result.metadata['billingCity']).toBe('Denver')
  })

  it('produces a schema-valid Supplier', () => {
    const result = transformSupplier(rawVendor)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })

  it('treats IsActive=false correctly', () => {
    const result = transformSupplier({ ...rawVendor, IsActive: false })
    expect(result.isActive).toBe(false)
  })

  it('falls back to CompanyName when VendorName is absent', () => {
    const result = transformSupplier({ ...rawVendor, VendorName: undefined })
    expect(result.name).toBe('Acme Supplies Co')
  })
})
