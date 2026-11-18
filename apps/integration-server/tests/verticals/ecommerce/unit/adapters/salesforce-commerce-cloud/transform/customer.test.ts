import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawScapiCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawScapiCustomer> = {}): RawScapiCustomer {
  return {
    customerId: 'cust-001',
    customerNo: 'C001',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    phone: '+44 20 7946 0958',
    enabled: true,
    addressBook: {
      addresses: [
        {
          addressId: 'home',
          address1: '221B Baker Street',
          city: 'London',
          postalCode: 'NW1 6XE',
          countryCode: 'GB',
          stateCode: 'ENG',
          preferred: true,
        },
      ],
      preferredAddress: {
        addressId: 'home',
        address1: '221B Baker Street',
        city: 'London',
        postalCode: 'NW1 6XE',
        countryCode: 'GB',
        stateCode: 'ENG',
        preferred: true,
      },
    },
    ordersCount: 3,
    createdAt: '2023-01-01T00:00:00Z',
    lastModified: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields, uses customerId as id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Smith')
    expect(result.phone).toBe('+44 20 7946 0958')
  })

  it('maps ordersCount', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
  })

  it('maps preferred address to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('221B Baker Street')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.defaultAddress?.region).toBe('ENG')
    expect(result.defaultAddress?.postalCode).toBe('NW1 6XE')
  })

  it('maps all addresses into addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
  })

  it('omits addresses with no meaningful fields', () => {
    const result = transformCustomer(
      makeCustomer({
        addressBook: {
          addresses: [{}],
          preferredAddress: null,
        },
      }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toHaveLength(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw.email).toBe('alice@example.com')
    expect(raw.firstName).toBe('Alice')
    expect(raw.lastName).toBe('Smith')
  })
})
