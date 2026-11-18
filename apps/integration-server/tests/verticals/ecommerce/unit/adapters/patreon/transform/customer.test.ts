import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawPatreonMember,
} from '../../../../../../../src/verticals/ecommerce/adapters/patreon/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import type { FlatResource } from '../../../../../../../src/verticals/ecommerce/adapters/patreon/client'

function makeMember(overrides: Partial<RawPatreonMember> = {}): RawPatreonMember {
  return {
    id: 'mem-001',
    email: 'patron@example.com',
    full_name: 'Jane Doe',
    is_follower: false,
    last_charge_date: '2024-03-01T00:00:00.000+00:00',
    last_charge_status: 'Paid',
    lifetime_support_cents: 6000,
    currently_entitled_amount_cents: 500,
    patron_status: 'active_patron',
    pledge_cadence: 1,
    pledge_relationship_start: '2023-06-15T10:00:00.000+00:00',
    will_pay_amount_cents: 500,
    _type: 'member',
    _relationships: {
      user: { data: { type: 'user', id: 'usr-001' } },
    },
    _included: [
      {
        id: 'usr-001',
        _type: 'user',
        email: 'jane@personal.com',
        first_name: 'Jane',
        last_name: 'Doe',
        full_name: 'Jane Doe',
        image_url: 'https://c10.patreonusercontent.com/jane.jpg',
        url: 'https://www.patreon.com/janedoe',
        created: '2020-01-01T00:00:00.000+00:00',
      } as unknown as FlatResource,
    ],
    ...overrides,
  }
}

describe('transformCustomer (Patreon Member)', () => {
  it('maps core member fields', () => {
    const result = transformCustomer(makeMember())
    expect(result.id).toBe('mem-001')
    expect(result.email).toBe('patron@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('calculates totalSpent from lifetime_support_cents', () => {
    const result = transformCustomer(makeMember())
    expect(result.totalSpent).toEqual({ amount: 60, currency: 'USD' })
  })

  it('uses pledge_relationship_start as createdAt', () => {
    const result = transformCustomer(makeMember())
    expect(result.createdAt).toBe('2023-06-15T10:00:00.000+00:00')
  })

  it('falls back to member email when user relationship is missing', () => {
    const result = transformCustomer(makeMember({
      _included: [],
      _relationships: {},
    }))
    expect(result.email).toBe('patron@example.com')
  })

  it('splits full_name when no user included', () => {
    const result = transformCustomer(makeMember({
      _included: [],
      _relationships: {},
      full_name: 'Alice Bob Wonderland',
    }))
    expect(result.firstName).toBe('Alice Bob')
    expect(result.lastName).toBe('Wonderland')
  })

  it('includes patron metadata fields', () => {
    const result = transformCustomer(makeMember())
    expect(result.metadata['patronStatus']).toBe('active_patron')
    expect(result.metadata['lastChargeStatus']).toBe('Paid')
    expect(result.metadata['userId']).toBe('usr-001')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeMember())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Patreon)', () => {
  it('round-trips writable fields', () => {
    const body = untransformCustomer({
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Smith',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('member')
    expect(body.data.attributes['email']).toBe('test@example.com')
    expect(body.data.attributes['full_name']).toBe('John Smith')
  })
})
