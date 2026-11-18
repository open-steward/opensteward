import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawAdyenShopper,
} from '../../../../../../../src/verticals/payments/adapters/adyen/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('adyen transformCustomer', () => {
  it('maps a full shopper record to canonical customer', () => {
    const raw: RawAdyenShopper = {
      shopperReference: 'SHOPPER-REF-1',
      shopperEmail: 'jane@example.com',
      shopperName: { firstName: 'Jane', lastName: 'Doe' },
      telephoneNumber: '+1-555-0100',
      billingAddress: { street: '1 Main St', city: 'Boston' },
      shopperLocale: 'en_EUR',
      countryCode: 'US',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('SHOPPER-REF-1')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+1-555-0100')
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('adyen')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to email as id when shopperReference is absent', () => {
    const raw: RawAdyenShopper = {
      shopperEmail: 'no-ref@example.com',
      shopperName: { firstName: 'Bob' },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('no-ref@example.com')
    expect(result.name).toBe('Bob')
    expect(result.currency).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits name when both first and last name are missing', () => {
    const raw: RawAdyenShopper = {
      shopperReference: 'REF-NONAME',
      shopperEmail: 'noname@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
