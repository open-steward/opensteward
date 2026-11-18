/**
 * The fixture follows the documented GET /storefront-users `data[]` item
 * (https://code.skio.com/rest-api/, OpenAPI inlined in the Redoc page):
 * properties id, platformId, firstName, lastName, email, phoneNumber,
 * createdAt, updatedAt, activeSubscriptions, cancelledSubscriptions,
 * pausedSubscriptions, failedSubscriptions; required id, createdAt,
 * updatedAt and the four subscription arrays. The spec ships no example
 * values, so the values are illustrative.
 */
import { describe, it, expect } from 'vitest'
import {
  transformStorefrontUser,
  type RawSkioStorefrontUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/skio/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeUser(overrides: Partial<RawSkioStorefrontUser> = {}): RawSkioStorefrontUser {
  return {
    id: '3f1c2b7e-9a1d-4c55-8e0f-1a2b3c4d5e6f',
    platformId: 'gid://shopify/Customer/7001',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phoneNumber: '+14155550101',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-06-01T08:00:00Z',
    activeSubscriptions: [
      {
        id: 'sub-001',
        platformId: 'gid://shopify/SubscriptionContract/1',
        status: 'ACTIVE',
        createdAt: '2024-01-15T10:05:00Z',
        SubscriptionLines: [],
      },
    ],
    cancelledSubscriptions: [],
    pausedSubscriptions: [],
    failedSubscriptions: [],
    ...overrides,
  }
}

describe('transformStorefrontUser', () => {
  it('maps the documented identity fields', () => {
    const result = CustomerSchema.parse(transformStorefrontUser(makeUser()))
    expect(result.id).toBe('3f1c2b7e-9a1d-4c55-8e0f-1a2b3c4d5e6f')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
  })

  it('maps the documented phoneNumber to phone', () => {
    const result = CustomerSchema.parse(transformStorefrontUser(makeUser()))
    expect(result.phone).toBe('+14155550101')
  })

  it('reads only the documented fields, ignoring undocumented look-alike keys', () => {
    const result = CustomerSchema.parse(
      transformStorefrontUser(
        makeUser({
          emailAddress: 'decoy@example.com',
          phone: '+10000000000',
          first_name: 'Decoy',
          last_name: 'Decoy',
          email: null,
          phoneNumber: null,
          firstName: null,
          lastName: null,
        }),
      ),
    )
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('maps timestamps to ISO strings', () => {
    const result = CustomerSchema.parse(transformStorefrontUser(makeUser()))
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T08:00:00.000Z')
  })

  it('maps no address, since none is documented', () => {
    const result = CustomerSchema.parse(transformStorefrontUser(makeUser()))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('preserves the raw payload, subscriptions included, in metadata', () => {
    const raw = makeUser()
    const result = CustomerSchema.parse(transformStorefrontUser(raw))
    expect(result.metadata).toEqual(raw)
  })

  it('handles the documented nullable fields as null', () => {
    const result = CustomerSchema.parse(
      transformStorefrontUser(
        makeUser({
          platformId: null,
          email: null,
          firstName: null,
          lastName: null,
          phoneNumber: null,
        }),
      ),
    )
    expect(result.email).toBeUndefined()
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })
})
