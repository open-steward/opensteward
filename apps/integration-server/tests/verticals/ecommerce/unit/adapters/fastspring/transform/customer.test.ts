/**
 * FastSpring Account transform tests.
 *
 * Raw shape per https://developer.fastspring.com/reference/retrieve-an-account
 * and https://developer.fastspring.com/reference/create-an-account.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawFastSpringAccount,
} from '../../../../../../../src/verticals/ecommerce/adapters/fastspring/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeAccount(overrides: Partial<RawFastSpringAccount> = {}): RawFastSpringAccount {
  return {
    id: 'abcDEFgHiJklM1N-3OP9q',
    account: 'abcDEFgHiJklM1N-3OP9q',
    contact: {
      first: 'Jane',
      last: 'Doe',
      email: 'jane.doe@example.com',
      phone: '555-555-5555',
      subscribed: true,
    },
    address: {
      addressLine1: '123 Main Street',
      addressLine2: 'Apt. 456',
      city: 'Santa Barbara',
      region: 'US-CA',
      postalCode: '93101',
    },
    language: 'en',
    country: 'US',
    orders: ['aAB0cdefGHiJkL0m8n8OpQ'],
    subscriptions: ['84a1bCDEf86g_-HijK_LMN'],
    ...overrides,
  }
}

describe('FastSpring transform/customer', () => {
  it('maps a full account and survives CustomerSchema.parse', () => {
    const customer = transformCustomer(makeAccount())
    expect(CustomerSchema.parse(customer)).toBeTruthy()
    expect(customer.id).toBe('abcDEFgHiJklM1N-3OP9q')
    expect(customer.email).toBe('jane.doe@example.com')
    expect(customer.firstName).toBe('Jane')
    expect(customer.lastName).toBe('Doe')
    expect(customer.acceptsMarketing).toBe(true)
    expect(customer.ordersCount).toBe(1)
  })

  it('maps the address with the top-level country attached', () => {
    const customer = transformCustomer(makeAccount())
    CustomerSchema.parse(customer)
    expect(customer.defaultAddress).toEqual({
      line1: '123 Main Street',
      line2: 'Apt. 456',
      city: 'Santa Barbara',
      region: 'US-CA',
      postalCode: '93101',
      country: 'US',
    })
    expect(customer.addresses).toEqual([customer.defaultAddress])
  })

  it('drops an unassigned/garbage country rather than failing the transform', () => {
    const customer = transformCustomer(makeAccount({ country: 'Nowhereland' }))
    expect(() => CustomerSchema.parse(customer)).not.toThrow()
    expect(customer.defaultAddress?.country).toBeUndefined()
  })

  it('throws a descriptive error when "account" is missing rather than inventing an id', () => {
    expect(() => transformCustomer({ id: 'acct_1' } as never)).toThrow(/missing "account"/)
  })

  it('leaves address undefined when the account has no address fields', () => {
    const customer = transformCustomer({ account: 'acct_1' })
    expect(CustomerSchema.parse(customer)).toBeTruthy()
    expect(customer.id).toBe('acct_1')
    expect(customer.defaultAddress).toBeUndefined()
  })

  it('preserves the complete raw payload in metadata', () => {
    const raw = makeAccount()
    const customer = transformCustomer(raw)
    expect(customer.metadata).toEqual(raw)
  })

  it('untransformCustomer builds a create/update body FastSpring accepts', () => {
    const customer = transformCustomer(makeAccount())
    const body = untransformCustomer(customer)
    expect(body).toEqual({
      contact: {
        first: 'Jane',
        last: 'Doe',
        email: 'jane.doe@example.com',
        phone: '555-555-5555',
      },
      country: 'US',
    })
  })
})
