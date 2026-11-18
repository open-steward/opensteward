import { describe, it, expect } from 'vitest'
import {
  transformCommerceCustomer,
  type RawGoDaddyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/commerce-customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

/**
 * Built from the guide's list response
 * (https://developer.godaddy.com/docs/api-users/commerce/manage-orders-and-customers/customer):
 * `customerId`, `firstName`, `lastName`, `emails: [{ email, default: true }]`,
 * `phones: [{ phone, default: true }]`, `createdAt`, `updatedAt`; plus
 * `addresses` and `orderCount` from the customers.json contract.
 */
function makeCustomer(overrides: Partial<RawGoDaddyCustomer> = {}): RawGoDaddyCustomer {
  return {
    customerId: '5b0c6a3e-3f2a-4c1b-9d0e-1a2b3c4d5e6f',
    firstName: 'Fredrick',
    lastName: 'Smith',
    emails: [
      { email: 'old@example.com', default: false },
      { email: 'fred@example.com', default: true },
    ],
    phones: [{ phone: '+14805550100', default: true }],
    addresses: [
      {
        address1: '100 S Mill Ave',
        city: 'Tempe',
        state: 'AZ',
        postalCode: '85281',
        country: 'US',
      },
    ],
    orderCount: 3,
    createdAt: '2026-08-27T10:00:00Z',
    updatedAt: '2026-08-28T11:30:00Z',
    ...overrides,
  }
}

describe('transformCommerceCustomer (GoDaddy Customer → Customer)', () => {
  it('parses against the canonical CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCommerceCustomer(makeCustomer()))).not.toThrow()
  })

  it('maps customerId, names, the default email and phone, and the address', () => {
    const c = transformCommerceCustomer(makeCustomer())
    expect(c.id).toBe('5b0c6a3e-3f2a-4c1b-9d0e-1a2b3c4d5e6f')
    expect(c.firstName).toBe('Fredrick')
    expect(c.lastName).toBe('Smith')
    expect(c.email).toBe('fred@example.com')
    expect(c.phone).toBe('+14805550100')
    expect(c.ordersCount).toBe(3)
    expect(c.addresses).toEqual([
      { line1: '100 S Mill Ave', city: 'Tempe', region: 'AZ', postalCode: '85281', country: 'US' },
    ])
    expect(c.createdAt).toBe('2026-08-27T10:00:00.000Z')
  })

  it('uses a sole unflagged email, but not one of several unflagged', () => {
    expect(
      transformCommerceCustomer(makeCustomer({ emails: [{ email: 'a@example.com' }] })).email,
    ).toBe('a@example.com')
    const many = transformCommerceCustomer(
      makeCustomer({ emails: [{ email: 'a@example.com' }, { email: 'b@example.com' }] }),
    )
    expect(many.email).toBeUndefined()
  })

  it('drops a country that is not an ISO alpha-2 code', () => {
    const c = transformCommerceCustomer(
      makeCustomer({ addresses: [{ city: 'Tempe', country: 'ZZ' }] }),
    )
    expect(c.addresses).toEqual([{ city: 'Tempe' }])
    expect(() => CustomerSchema.parse(c)).not.toThrow()
  })
})
