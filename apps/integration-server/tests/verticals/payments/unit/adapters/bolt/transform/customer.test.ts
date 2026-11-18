import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawBoltShopper,
} from '../../../../../../../src/verticals/payments/adapters/bolt/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('bolt transformCustomer', () => {
  it('maps id, email, and composed name to canonical customer', () => {
    const raw: RawBoltShopper = {
      id: 'shopper-001',
      email: 'jane@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+14155550123',
      default_currency: 'usd',
      date_created: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('shopper-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('bolt')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('prefers raw.name over first_name + last_name', () => {
    const raw: RawBoltShopper = {
      id: 'shopper-002',
      first_name: 'John',
      last_name: 'Smith',
      name: 'Johnny S.',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Johnny S.')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawBoltShopper = {
      id: 'shopper-003',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('shopper-003')
    expect(result.name).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.currency).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
