import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawTapCustomer,
} from '../../../../../../../src/verticals/payments/adapters/tap-payments/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('tap-payments transformCustomer', () => {
  it('maps a full customer object correctly', () => {
    const raw: RawTapCustomer = {
      id: 'cus_001',
      first_name: 'Jane',
      middle_name: 'A',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: { country_code: 1, number: '4155550123' },
      currency: 'USD',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_001')
    expect(result.name).toBe('Jane A Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+14155550123')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('tap-payments')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer with only id', () => {
    const raw: RawTapCustomer = {
      id: 'cus_002',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_002')
    expect(result.name).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.gateway).toBe('tap-payments')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('uppercases the currency code', () => {
    const raw: RawTapCustomer = {
      id: 'cus_003',
      currency: 'aed',
    }
    const result = transformCustomer(raw)
    expect(result.currency).toBe('AED')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('joins phone with country code prefix', () => {
    const raw: RawTapCustomer = {
      id: 'cus_004',
      phone: { country_code: '971', number: '501234567' },
    }
    const result = transformCustomer(raw)
    expect(result.phone).toBe('+971501234567')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
