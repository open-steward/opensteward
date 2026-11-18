import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  buildActionsForCustomer,
  type RawCtCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawCtCustomer> = {}): RawCtCustomer {
  return {
    id: 'cust-1',
    version: 4,
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    addresses: [
      {
        id: 'addr-1',
        streetName: 'Programmer Way',
        streetNumber: '1',
        city: 'London',
        postalCode: 'NW1 2AB',
        country: 'GB',
      },
    ],
    defaultShippingAddressId: 'addr-1',
    createdAt: '2024-01-01T00:00:00Z',
    lastModifiedAt: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (commercetools)', () => {
  it('maps core fields', () => {
    const r = transformCustomer(makeCustomer())
    expect(r.id).toBe('cust-1')
    expect(r.email).toBe('ada@example.com')
    expect(r.firstName).toBe('Ada')
    expect(r.lastName).toBe('Lovelace')
  })

  it('joins streetName + streetNumber into canonical line1', () => {
    const r = transformCustomer(makeCustomer())
    expect(r.defaultAddress?.line1).toBe('Programmer Way 1')
    expect(r.defaultAddress?.country).toBe('GB')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const r = transformCustomer(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const r = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(r)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical) as Record<string, unknown>
    expect(raw['email']).toBe('ada@example.com')
    expect(raw['firstName']).toBe('Ada')
  })

  it('builds update actions from a partial patch', () => {
    const actions = buildActionsForCustomer(makeCustomer(), {
      email: 'new@example.com',
      firstName: 'Augusta',
    })
    expect(actions.map((a) => a['action'])).toEqual(['changeEmail', 'setFirstName'])
  })
})
