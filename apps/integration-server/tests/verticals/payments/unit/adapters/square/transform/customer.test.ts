import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawSquareCustomer,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('square transformCustomer', () => {
  it('maps a full Square customer record', () => {
    const raw: RawSquareCustomer = {
      id: 'SQ-CUST-001',
      email_address: 'alice@example.com',
      given_name: 'Alice',
      family_name: 'Wonder',
      phone_number: '+15551234567',
      note: 'VIP customer',
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('SQ-CUST-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Wonder')
    expect(result.phone).toBe('+15551234567')
    expect(result.description).toBe('VIP customer')
    expect(result.gateway).toBe('square')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing name fields gracefully', () => {
    const raw: RawSquareCustomer = {
      id: 'SQ-CUST-002',
      email_address: 'noname@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(result.email).toBe('noname@example.com')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('joins given_name and family_name with a space', () => {
    const raw: RawSquareCustomer = {
      id: 'SQ-CUST-003',
      given_name: 'Bob',
      family_name: 'Builder',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Bob Builder')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
