import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawCashfreeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/cashfree/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('cashfree transformCustomer', () => {
  it('maps a full customer entity', () => {
    const raw: RawCashfreeCustomer = {
      customer_uid: 'uid-001',
      customer_email: 'jane@example.com',
      customer_name: 'Jane Doe',
      customer_phone: '+919876543210',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('uid-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+919876543210')
    expect(result.gateway).toBe('cashfree')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields', () => {
    const raw: RawCashfreeCustomer = {
      customer_uid: 'uid-002',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('uid-002')
    expect(result.email).toBeNull()
    expect(result.name).toBeNull()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
