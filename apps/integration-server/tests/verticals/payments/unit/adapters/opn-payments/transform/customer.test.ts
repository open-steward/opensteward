import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawOpnCustomer,
} from '../../../../../../../src/verticals/payments/adapters/opn-payments/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('opn-payments transformCustomer', () => {
  it('maps id, email, description, and created to canonical customer', () => {
    const raw: RawOpnCustomer = {
      id: 'cust_test_abc',
      email: 'jane@example.com',
      description: 'Jane Doe',
      metadata: { tier: 'gold' },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust_test_abc')
    expect(result.externalId).toBe('cust_test_abc')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.gateway).toBe('opn-payments')
    expect(result.metadata).toEqual({ tier: 'gold' })
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits email and name when absent', () => {
    const raw: RawOpnCustomer = {
      id: 'cust_test_minimal',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust_test_minimal')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to "extra" for metadata when "metadata" is absent', () => {
    const raw: RawOpnCustomer = {
      id: 'cust_extra',
      extra: { ref: 'ext-001' },
    }
    const result = transformCustomer(raw)
    expect(result.metadata).toEqual({ ref: 'ext-001' })
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
