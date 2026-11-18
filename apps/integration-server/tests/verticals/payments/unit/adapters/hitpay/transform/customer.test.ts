import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawHitpayCustomer,
} from '../../../../../../../src/verticals/payments/adapters/hitpay/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('hitpay transformCustomer', () => {
  it('maps a full customer record correctly', () => {
    const raw: RawHitpayCustomer = {
      id: 'cust-001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone_number: '+6598765432',
      phone_number_country_code: 'SG',
      birth_date: '1990-01-15',
      gender: 'female',
      remark: 'VIP customer',
      address: {
        city: 'Singapore',
        state: 'Central',
        street: '1 Marina Blvd',
        postal_code: '018989',
        country: 'SG',
      },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+6598765432')
    expect(result.description).toBe('VIP customer')
    expect(result.gateway).toBe('hitpay')
    expect(result.billingAddress?.city).toBe('Singapore')
    expect(result.billingAddress?.postalCode).toBe('018989')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('returns undefined billingAddress when address fields are all absent', () => {
    const raw: RawHitpayCustomer = {
      id: 'cust-002',
      email: 'no-addr@example.com',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress).toBeUndefined()
    expect(result.email).toBe('no-addr@example.com')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
