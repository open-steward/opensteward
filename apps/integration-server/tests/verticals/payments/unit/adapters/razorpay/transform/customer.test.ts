import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawRazorpayCustomer,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('razorpay transformCustomer', () => {
  it('maps email, name, phone and gateway correctly', () => {
    const raw: RawRazorpayCustomer = {
      id: 'cust_1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      contact: '+919876543210',
      gstin: 'GST123',
      notes: { plan: 'pro' },
      created_at: 1_700_000_000,
    }
    const result = transformCustomer(raw)

    expect(result.id).toBe('cust_1')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+919876543210')
    expect(result.gateway).toBe('razorpay')
    expect(result.metadata.gstin).toBe('GST123')
    expect(result.metadata.plan).toBe('pro')
    expect(result.createdAt).toMatch(/^2023-/)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles a minimal customer with no optional fields', () => {
    const raw: RawRazorpayCustomer = {
      id: 'cust_2',
    }
    const result = transformCustomer(raw)

    expect(result.id).toBe('cust_2')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.gateway).toBe('razorpay')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
