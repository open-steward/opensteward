import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawPaystackCustomer,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('paystack transformCustomer', () => {
  it('maps id, customer_code, email, and full name', () => {
    const raw: RawPaystackCustomer = {
      id: 42,
      customer_code: 'CUS_abc123',
      email: 'jane@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+2348012345678',
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('CUS_abc123')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+2348012345678')
    expect(result.gateway).toBe('paystack')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back id to customer_code when id is absent', () => {
    const raw: RawPaystackCustomer = {
      customer_code: 'CUS_xyz789',
      email: 'anon@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('CUS_xyz789')
    expect(result.externalId).toBe('CUS_xyz789')
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('joins first_name and last_name with a space', () => {
    const raw: RawPaystackCustomer = {
      id: 10,
      customer_code: 'CUS_111',
      first_name: 'Alice',
      last_name: 'Smith',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Alice Smith')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('returns undefined name when no name fields present', () => {
    const raw: RawPaystackCustomer = {
      id: 20,
      customer_code: 'CUS_222',
      email: 'noname@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
