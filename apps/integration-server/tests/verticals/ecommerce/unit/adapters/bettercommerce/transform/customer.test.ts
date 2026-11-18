import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawBCCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawBCCustomer> = {}): RawBCCustomer {
  return {
    userId: 'user-001',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+44-7700-900001',
    isSubscribed: true,
    address: {
      address1: '10 Downing St',
      address2: 'Flat 1',
      city: 'London',
      state: 'England',
      postCode: 'SW1A 2AA',
      countryCode: 'GB',
    },
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (BetterCommerce)', () => {
  it('maps userId to id', () => {
    const result = transformCustomer(makeCustomer({ userId: 'user-001' }))
    expect(result.id).toBe('user-001')
  })

  it('falls back to recordId when userId is absent', () => {
    const result = transformCustomer(makeCustomer({ userId: undefined, recordId: 'rec-abc' }))
    expect(result.id).toBe('rec-abc')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('john@example.com')
  })

  it('maps firstName and lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Doe')
  })

  it('maps phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+44-7700-900001')
  })

  it('maps isSubscribed to acceptsMarketing', () => {
    const result = transformCustomer(makeCustomer({ isSubscribed: true }))
    expect(result.acceptsMarketing).toBe(true)
  })

  it('falls back to isNewsletterSubscribed', () => {
    const result = transformCustomer(
      makeCustomer({ isSubscribed: undefined, isNewsletterSubscribed: false }),
    )
    expect(result.acceptsMarketing).toBe(false)
  })

  it('maps address to defaultAddress using countryCode', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('10 Downing St')
    expect(result.defaultAddress?.country).toBe('GB')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-06-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (BetterCommerce)', () => {
  it('maps email, firstName, lastName', () => {
    const body = untransformCustomer({ email: 'a@b.com', firstName: 'Jane', lastName: 'Doe' })
    expect(body.email).toBe('a@b.com')
    expect(body.firstName).toBe('Jane')
    expect(body.lastName).toBe('Doe')
  })

  it('maps acceptsMarketing to isSubscribed', () => {
    const body = untransformCustomer({ acceptsMarketing: true })
    expect(body.isSubscribed).toBe(true)
  })

  it('maps defaultAddress to address object', () => {
    const body = untransformCustomer({
      defaultAddress: { line1: '1 Road', city: 'London', country: 'GB', postalCode: 'EC1A 1BB' },
    })
    const addr = body.address as Record<string, unknown>
    expect(addr.address1).toBe('1 Road')
    expect(addr.countryCode).toBe('GB')
  })
})
