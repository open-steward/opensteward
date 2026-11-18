import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawRevelVendor,
} from '../../../../../../../src/verticals/inventory/adapters/revel-systems/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('revel-systems transformSupplier', () => {
  const raw: RawRevelVendor = {
    id: 12,
    name: 'Fresh Farms Co',
    email: 'orders@freshfarms.example',
    phone: '+14155559876',
    contact_name: 'Jane Smith',
    active: true,
    address: '456 Farm Rd',
    city: 'Fresno',
    state: 'CA',
    zip: '93706',
    country: 'US',
  }

  it('stringifies numeric id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('12')
    expect(result.externalId).toBe('12')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Fresh Farms Co')
  })

  it('maps email and phone', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@freshfarms.example')
    expect(result.phone).toBe('+14155559876')
  })

  it('maps isActive from active boolean', () => {
    expect(transformSupplier({ ...raw, active: true }).isActive).toBe(true)
    expect(transformSupplier({ ...raw, active: false }).isActive).toBe(false)
  })

  it('defaults isActive to true when active is absent', () => {
    const result = transformSupplier({ id: 99, name: 'No Active Field' })
    expect(result.isActive).toBe(true)
  })

  it('leaves defaultCurrency and defaultLeadTimeDays undefined', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBeUndefined()
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('stores address fields in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata['address']).toBe('456 Farm Rd')
    expect(result.metadata['city']).toBe('Fresno')
    expect(result.metadata['state']).toBe('CA')
    expect(result.metadata['country']).toBe('US')
  })

  it('sets platform to revel-systems', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('revel-systems')
  })

  it('omits email when absent', () => {
    const result = transformSupplier({ id: 1, name: 'Vendor', email: null })
    expect(result.email).toBeUndefined()
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
