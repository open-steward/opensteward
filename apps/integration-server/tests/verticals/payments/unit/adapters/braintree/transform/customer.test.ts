import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawBraintreeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/braintree/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('braintree transformCustomer', () => {
  it('maps a full customer record to canonical', () => {
    const raw: RawBraintreeCustomer = {
      id: 'cust_001',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      phoneNumber: '+1-555-0200',
      company: 'Acme Corp',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cust_001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    expect(result.phone).toBe('+1-555-0200')
    expect(result.description).toBe('Acme Corp')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.gateway).toBe('braintree')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('concatenates first and last name correctly', () => {
    const raw: RawBraintreeCustomer = {
      id: 'cust_002',
      firstName: 'Bob',
      lastName: 'Jones',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Bob Jones')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits name when both first and last name are missing', () => {
    const raw: RawBraintreeCustomer = {
      id: 'cust_003',
      email: 'noname@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to legacyId when id is absent', () => {
    const raw: RawBraintreeCustomer = {
      legacyId: 'legacy_cust_001',
      email: 'legacy@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('legacy_cust_001')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
