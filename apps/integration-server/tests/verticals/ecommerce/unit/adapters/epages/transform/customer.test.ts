/**
 * ePages Beyond Customer ↔ canonical Customer.
 * Docs: https://api-docs.beyondshop.cloud/ng-customer-customer-public-api.html
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawEpagesCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/epages/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawEpagesCustomer> = {}): RawEpagesCustomer {
  return {
    _id: 'c1',
    email: 'jane@example.com',
    customerNumber: '1001',
    defaultBillingAddress: {
      firstName: 'Jane',
      lastName: 'Doe',
      street: 'Market Street',
      houseNumber: '2500',
      postalCode: '94114',
      city: 'San Francisco',
      country: 'US',
      phone: '+14155550123',
    },
    creationDate: '2026-01-15T09:30:00.000',
    ...overrides,
  }
}

describe('transformCustomer (ePages Beyond)', () => {
  it('maps core fields and the default billing address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('c1')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('+14155550123')
    expect(result.defaultAddress).toEqual({
      line1: 'Market Street 2500',
      line2: undefined,
      city: 'San Francisco',
      region: undefined,
      postalCode: '94114',
      country: 'US',
    })
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeCustomer()))).not.toThrow()
  })
})

describe('untransformCustomer (ePages Beyond)', () => {
  it('requires email', () => {
    expect(() => untransformCustomer({ firstName: 'Jane' })).toThrow(/requires `email`/)
  })

  it('maps the whole address line into `street` without guessing a split', () => {
    const body = untransformCustomer({
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      defaultAddress: { line1: 'Market Street 2500', city: 'SF', postalCode: '94114', country: 'US' },
    }) as Record<string, unknown>
    const billing = body.billingAddress as Record<string, unknown>
    expect(billing.street).toBe('Market Street 2500')
    expect(billing).not.toHaveProperty('houseNumber')
  })
})
