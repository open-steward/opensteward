import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawFlutterwaveCustomer,
} from '../../../../../../../src/verticals/payments/adapters/flutterwave/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('flutterwave transformCustomer', () => {
  it('maps a customer with all fields', () => {
    const raw: RawFlutterwaveCustomer = {
      id: 99,
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone_number: '+2348012345678',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+2348012345678')
    expect(result.gateway).toBe('flutterwave')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles a customer with only id and email', () => {
    const raw: RawFlutterwaveCustomer = {
      id: 100,
      email: 'minimal@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('100')
    expect(result.email).toBe('minimal@example.com')
    expect(result.name).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles customer with phone but no email', () => {
    const raw: RawFlutterwaveCustomer = {
      id: 101,
      name: 'Phone Only User',
      phone_number: '+2347098765432',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('101')
    expect(result.phone).toBe('+2347098765432')
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
