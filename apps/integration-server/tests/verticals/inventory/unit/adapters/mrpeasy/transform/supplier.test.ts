import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawMrpeasySupplier,
} from '../../../../../../../src/verticals/inventory/adapters/mrpeasy/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('mrpeasy transformSupplier', () => {
  const raw: RawMrpeasySupplier = {
    vendor_id: 77,
    code: 'STEEL-CO',
    title: 'Steel Vendor Inc.',
    email: 'orders@steelvendor.example.com',
    phone: '+1-555-0100',
    currency: 'USD',
    lead_time: 14,
    url: 'https://steelvendor.example.com',
    address: '100 Industrial Ave, Chicago, IL',
  }

  it('maps id and externalId from vendor_id as string', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps name from title field', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Steel Vendor Inc.')
  })

  it('maps email field', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@steelvendor.example.com')
  })

  it('maps phone field', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+1-555-0100')
  })

  it('maps defaultCurrency from currency field', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from lead_time', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to mrpeasy', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('mrpeasy')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
