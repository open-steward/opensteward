import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawAirwallexCustomer,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('airwallex transformCustomer', () => {
  it('maps top-level name fields and email', () => {
    const raw: RawAirwallexCustomer = {
      id: 'cus-001',
      merchant_customer_id: 'merch-cus-001',
      email: 'jane@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
      phone_number: '+14155550123',
      created_at: '2024-03-01T12:00:00+0000',
      updated_at: '2024-03-01T12:00:00+0000',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-001')
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+14155550123')
    expect(result.gateway).toBe('airwallex')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to additional_info for first/last name', () => {
    const raw: RawAirwallexCustomer = {
      id: 'cus-002',
      email: 'alice@example.com',
      additional_info: { first_name: 'Alice', last_name: 'Smith' },
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Alice Smith')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back id to merchant_customer_id when id is absent', () => {
    const raw: RawAirwallexCustomer = {
      merchant_customer_id: 'merch-only-001',
      email: 'bob@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('merch-only-001')
    expect(result.externalId).toBe('merch-only-001')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('sets name to undefined when no name fields are present', () => {
    const raw: RawAirwallexCustomer = {
      id: 'cus-003',
      email: 'noname@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('merges merchant_customer_id into metadata', () => {
    const raw: RawAirwallexCustomer = {
      id: 'cus-004',
      merchant_customer_id: 'merch-004',
    }
    const result = transformCustomer(raw)
    expect(result.metadata['merchant_customer_id']).toBe('merch-004')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
