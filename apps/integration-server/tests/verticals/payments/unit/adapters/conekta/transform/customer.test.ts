import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawConektaCustomer,
} from '../../../../../../../src/verticals/payments/adapters/conekta/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('conekta transformCustomer', () => {
  it('maps a customer with all fields correctly', () => {
    const raw: RawConektaCustomer = {
      id: 'cust-001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+525512345678',
      default_payment_source_id: 'src-001',
      created_at: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+525512345678')
    expect(result.defaultPaymentMethodId).toBe('src-001')
    expect(result.gateway).toBe('conekta')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer with only id', () => {
    const raw: RawConektaCustomer = {
      id: 'cust-002',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-002')
    expect(result.email).toBeUndefined()
    expect(result.gateway).toBe('conekta')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
