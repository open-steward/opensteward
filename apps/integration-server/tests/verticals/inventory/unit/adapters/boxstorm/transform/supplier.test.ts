import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawBoxstormVendor,
} from '../../../../../../../src/verticals/inventory/adapters/boxstorm/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('boxstorm transformSupplier', () => {
  const raw: RawBoxstormVendor = {
    id: 10,
    name: 'Acme Supplies Inc.',
    accountNumber: 'ACC-001',
    active: true,
  }

  it('maps id and externalId as string from numeric id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('10')
    expect(result.externalId).toBe('10')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Supplies Inc.')
  })

  it('sets isActive to true when active is true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when active is false', () => {
    const result = transformSupplier({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when active is absent', () => {
    const result = transformSupplier({ id: 99, name: 'Test Vendor' })
    expect(result.isActive).toBe(true)
  })

  it('stores accountNumber in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata.accountNumber).toBe('ACC-001')
  })

  it('sets platform to boxstorm', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('boxstorm')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
