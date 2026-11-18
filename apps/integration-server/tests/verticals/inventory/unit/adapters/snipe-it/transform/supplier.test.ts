import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSnipeItSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/snipe-it/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('snipe-it transformSupplier', () => {
  const raw: RawSnipeItSupplier = {
    id: 8,
    name: 'Tech Supplies Ltd',
    email: 'procurement@techsupplies.example',
    phone: '+14155550188',
    url: 'https://techsupplies.example',
    address: '100 Supply Road',
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    zip: '94102',
    contact: 'Jane Smith',
    notes: 'Preferred hardware vendor',
    assets_count: 15,
    licenses_count: 3,
  }

  it('maps id (numeric) as string and name', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('8')
    expect(result.name).toBe('Tech Supplies Ltd')
    expect(result.platform).toBe('snipe-it')
  })

  it('maps email and phone', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('procurement@techsupplies.example')
    expect(result.phone).toBe('+14155550188')
  })

  it('always sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('stores address and contact info in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata['url']).toBe('https://techsupplies.example')
    expect(result.metadata['contact']).toBe('Jane Smith')
    expect(result.metadata['city']).toBe('San Francisco')
    expect(result.metadata['assetsCount']).toBe('15')
  })

  it('falls back to id as name when name is absent', () => {
    const { name: _, ...noName } = raw
    const result = transformSupplier(noName)
    expect(result.name).toBe('8')
  })

  it('produces output satisfying SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
