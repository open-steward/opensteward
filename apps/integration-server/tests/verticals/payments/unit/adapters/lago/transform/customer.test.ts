import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawLagoCustomer,
} from '../../../../../../../src/verticals/payments/adapters/lago/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('lago transformCustomer', () => {
  it('maps external_id, email, name, and billing address', () => {
    const raw: RawLagoCustomer = {
      lago_id: 'lago-cust-001',
      external_id: 'ext-001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1-555-0100',
      currency: 'usd',
      address_line1: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zipcode: '62701',
      country: 'us',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('ext-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.currency).toBe('USD')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.gateway).toBe('lago')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('composes name from firstname + lastname when name is absent', () => {
    const raw: RawLagoCustomer = {
      lago_id: 'lago-cust-002',
      external_id: 'ext-002',
      firstname: 'John',
      lastname: 'Smith',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('John Smith')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformCustomer', () => {
    const raw: RawLagoCustomer = {
      external_id: 'ext-003',
      email: 'user@example.com',
      name: 'Test User',
      currency: 'EUR',
    }
    const canonical = transformCustomer(raw)
    const body = untransformCustomer(canonical)
    expect(body.external_id).toBe('ext-003')
    expect(body.email).toBe('user@example.com')
    expect(body.currency).toBe('EUR')
  })
})
