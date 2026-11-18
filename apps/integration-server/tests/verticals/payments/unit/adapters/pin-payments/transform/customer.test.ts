import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawPinCustomer,
} from '../../../../../../../src/verticals/payments/adapters/pin-payments/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('pin-payments transformCustomer', () => {
  it('maps token to id/externalId and first_name to name', () => {
    const raw: RawPinCustomer = {
      token: 'cus_abc123',
      email: 'alice@example.com',
      first_name: 'Alice',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_abc123')
    expect(result.externalId).toBe('cus_abc123')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice')
    expect(result.gateway).toBe('pin-payments')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits name when first_name is absent', () => {
    const raw: RawPinCustomer = {
      token: 'cus_noname',
      email: 'bob@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(result.email).toBe('bob@example.com')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object (empty-ish) — sets gateway without throwing in transform', () => {
    const raw: RawPinCustomer = {}
    const result = transformCustomer(raw)
    expect(result.id).toBe('')
    expect(result.gateway).toBe('pin-payments')
    // empty id is an invalid canonical object; we only verify the transform doesn't throw
  })
})
