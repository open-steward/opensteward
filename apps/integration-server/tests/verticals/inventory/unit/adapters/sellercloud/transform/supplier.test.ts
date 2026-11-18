import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSellercloudVendor,
} from '../../../../../../../src/verticals/inventory/adapters/sellercloud/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('sellercloud transformSupplier', () => {
  const raw: RawSellercloudVendor = {
    ID: 55,
    Name: 'Acme Supplies Co',
    Email: 'orders@acme.example',
    EmailCC: 'cc@acme.example',
    IsActive: true,
    IsDefault: false,
    Alias: 'Acme',
    AccountNumber: 'ACC-001',
    Website: 'https://acme.example',
  }

  it('maps ID to id and externalId as string', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps Name to name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Supplies Co')
  })

  it('maps Email to email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps IsActive boolean true to isActive true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps IsActive boolean false to isActive false', () => {
    const inactive: RawSellercloudVendor = { ...raw, IsActive: false }
    expect(transformSupplier(inactive).isActive).toBe(false)
  })

  it('maps IsActive numeric 0 to isActive false', () => {
    const numericInactive: RawSellercloudVendor = { ...raw, IsActive: 0 }
    expect(transformSupplier(numericInactive).isActive).toBe(false)
  })

  it('maps IsActive numeric 1 to isActive true', () => {
    const numericActive: RawSellercloudVendor = { ...raw, IsActive: 1 }
    expect(transformSupplier(numericActive).isActive).toBe(true)
  })

  it('sets platform to sellercloud', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('sellercloud')
  })

  it('satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
