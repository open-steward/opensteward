import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawSezzleCustomer,
} from '../../../../../../../src/verticals/payments/adapters/sezzle/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('sezzle transformCustomer', () => {
  it('maps full customer fields correctly', () => {
    const raw: RawSezzleCustomer = {
      uuid: 'cust-uuid-001',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+14155550123',
      expiration: '2025-12-31T23:59:59Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-uuid-001')
    expect(result.externalId).toBe('cust-uuid-001')
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+14155550123')
    expect(result.gateway).toBe('sezzle')
    expect(result.metadata['tokenization_expiration']).toBe('2025-12-31T23:59:59Z')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles customer with only uuid and email', () => {
    const raw: RawSezzleCustomer = {
      uuid: 'cust-uuid-002',
      email: 'buyer@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust-uuid-002')
    expect(result.email).toBe('buyer@example.com')
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits name when both first_name and last_name are absent', () => {
    const raw: RawSezzleCustomer = {
      uuid: 'cust-uuid-003',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
