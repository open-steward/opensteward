import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawChargebeeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/chargebee/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

const baseRaw: RawChargebeeCustomer = {
  id: 'cust_001',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Smith',
  phone: '+15550001234',
  primary_payment_source_id: 'pm_abc',
  preferred_currency_code: 'USD',
  created_at: 1709251200, // 2024-03-01T00:00:00Z
  updated_at: 1709251200,
}

describe('chargebee transformCustomer', () => {
  it('surfaces id, email, and gateway', () => {
    const result = transformCustomer(baseRaw)
    expect(result.id).toBe('cust_001')
    expect(result.email).toBe('alice@example.com')
    expect(result.gateway).toBe('chargebee')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('concatenates first_name and last_name into name', () => {
    const result = transformCustomer(baseRaw)
    expect(result.name).toBe('Alice Smith')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps primary_payment_source_id to defaultPaymentMethodId', () => {
    const result = transformCustomer(baseRaw)
    expect(result.defaultPaymentMethodId).toBe('pm_abc')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('converts preferred_currency_code to uppercase', () => {
    const result = transformCustomer({ ...baseRaw, preferred_currency_code: 'eur' })
    expect(result.currency).toBe('EUR')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('converts Unix-second created_at to ISO string', () => {
    const result = transformCustomer(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits name when both first_name and last_name are absent', () => {
    const result = transformCustomer({ ...baseRaw, first_name: undefined, last_name: undefined })
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
