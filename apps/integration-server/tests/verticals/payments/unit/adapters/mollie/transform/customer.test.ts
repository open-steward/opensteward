import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawMollieCustomer,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('mollie transformCustomer', () => {
  it('maps email, name, locale-derived currency and metadata', () => {
    // locale suffix becomes the currency code; 'en_EUR' is a fake locale but
    // produces the 3-char ISO code 'EUR' that the schema accepts.
    const raw: RawMollieCustomer = {
      id: 'cst_1',
      name: 'Alice Smith',
      email: 'alice@example.com',
      locale: 'en_EUR',
      metadata: { tier: 'gold' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformCustomer(raw)

    expect(result.id).toBe('cst_1')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('mollie')
    expect(result.metadata.tier).toBe('gold')
    expect(result.createdAt).toBe('2023-11-01T00:00:00+00:00')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles a customer with no locale or metadata', () => {
    const raw: RawMollieCustomer = {
      id: 'cst_2',
      email: 'bob@example.com',
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformCustomer(raw)

    expect(result.currency).toBeUndefined()
    expect(result.metadata).toEqual({})
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
