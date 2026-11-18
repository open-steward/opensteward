import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSyliusCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawSyliusCustomer> = {}): RawSyliusCustomer {
  return {
    id: 10,
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Johnson',
    phoneNumber: '+1-555-0200',
    gender: 'f',
    subscribedToNewsletter: true,
    defaultAddress: {
      id: 1,
      firstName: 'Alice',
      lastName: 'Johnson',
      street: '456 Oak Ave',
      city: 'Seattle',
      provinceName: 'Washington',
      countryCode: 'US',
      postcode: '98101',
      phoneNumber: '+1-555-0201',
    },
    createdAt: '2024-01-05T09:00:00Z',
    updatedAt: '2024-03-10T14:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('10')
    expect(result.email).toBe('alice@example.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Johnson')
    expect(result.phone).toBe('+1-555-0200')
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toEqual({
      line1: '456 Oak Ave',
      city: 'Seattle',
      region: 'Washington',
      postalCode: '98101',
      country: 'US',
    })
  })

  it('sets addresses array from default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
  })

  it('handles null default address', () => {
    const result = transformCustomer(makeCustomer({ defaultAddress: null }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('falls back to defaultAddress phoneNumber when phoneNumber missing', () => {
    const result = transformCustomer(makeCustomer({ phoneNumber: null }))
    expect(result.phone).toBe('+1-555-0201')
  })

  it('handles customer with no phone anywhere', () => {
    const result = transformCustomer(
      makeCustomer({
        phoneNumber: null,
        defaultAddress: { street: '123 Main', city: 'Test' },
      }),
    )
    expect(result.phone).toBeUndefined()
  })

  it('preserves metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('alice@example.com')
    expect(body['firstName']).toBe('Alice')
    expect(body['lastName']).toBe('Johnson')
    expect(body['subscribedToNewsletter']).toBe(true)
  })
})
