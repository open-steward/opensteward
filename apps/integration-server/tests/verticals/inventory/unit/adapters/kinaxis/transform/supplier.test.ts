import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawKinaxisSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/kinaxis/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('kinaxis transformSupplier', () => {
  const raw: RawKinaxisSupplier = {
    id: 'sup-uuid-001',
    supplierName: 'Global Parts Inc',
    supplierCode: 'GPI',
    status: 'Active',
    email: 'procurement@globalparts.com',
    phone: '+1-800-555-0100',
    defaultCurrency: 'USD',
    defaultLeadTime: 21,
    siteId: 'site-uuid-001',
  }

  it('maps id from raw.id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('sup-uuid-001')
    expect(result.externalId).toBe('sup-uuid-001')
  })

  it('maps name from supplierName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Global Parts Inc')
  })

  it('falls back to supplierCode when supplierName is missing', () => {
    const result = transformSupplier({ ...raw, supplierName: undefined })
    expect(result.name).toBe('GPI')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('procurement@globalparts.com')
  })

  it('maps phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+1-800-555-0100')
  })

  it('maps defaultCurrency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from defaultLeadTime', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(21)
  })

  it('sets isActive true when status=Active', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status=Inactive', () => {
    const result = transformSupplier({ ...raw, status: 'Inactive' })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive true when status is missing (empty string !== inactive)', () => {
    const result = transformSupplier({ ...raw, status: undefined })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to kinaxis', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('kinaxis')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
