import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type BagistoCustomer,
  type BagistoCustomerAddress,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagisto/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<BagistoCustomerAddress> = {}): BagistoCustomerAddress {
  return {
    id: 10,
    first_name: 'Jane',
    last_name: 'Smith',
    address1: '789 Elm Street',
    address2: 'Suite 200',
    city: 'San Francisco',
    state: 'CA',
    postcode: '94103',
    country: 'US',
    phone: '+1 415 000 5678',
    default_address: true,
    ...overrides,
  }
}

function makeCustomer(overrides: Partial<BagistoCustomer> = {}): BagistoCustomer {
  return {
    id: 123,
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane.smith@example.com',
    phone: '+1 415 000 5678',
    gender: 'female',
    date_of_birth: '1990-05-15',
    created_at: '2024-02-01T09:00:00.000Z',
    updated_at: '2024-06-20T14:00:00.000Z',
    addresses: [makeAddress()],
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformCustomer (Bagisto)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('123')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane.smith@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Smith')
    expect(result.phone).toBe('+1 415 000 5678')
  })

  it('maps the default_address=true to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toMatchObject({
      line1: '789 Elm Street',
      line2: 'Suite 200',
      city: 'San Francisco',
      region: 'CA',
      postalCode: '94103',
      country: 'US',
    })
  })

  it('falls back to first address when no default_address flag', () => {
    const customer = makeCustomer({
      addresses: [makeAddress({ default_address: false })],
    })
    const result = transformCustomer(customer)
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress!.city).toBe('San Francisco')
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]).toMatchObject({ city: 'San Francisco' })
  })

  it('handles multiple addresses including non-default', () => {
    const customer = makeCustomer({
      addresses: [
        makeAddress({ id: 10, city: 'San Francisco', default_address: true }),
        makeAddress({ id: 11, city: 'Los Angeles', default_address: false }),
      ],
    })
    const result = transformCustomer(customer)
    expect(result.addresses).toHaveLength(2)
    expect(result.defaultAddress!.city).toBe('San Francisco')
  })

  it('handles address1 as array', () => {
    const customer = makeCustomer({
      addresses: [makeAddress({ address1: ['100 Main St', 'Building A'] })],
    })
    const result = transformCustomer(customer)
    expect(result.defaultAddress!.line1).toBe('100 Main St, Building A')
  })

  it('returns undefined defaultAddress when addresses is empty', () => {
    const result = transformCustomer(makeCustomer({ addresses: [] }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('returns undefined addresses when all addresses are empty', () => {
    const customer = makeCustomer({
      addresses: [{ id: 1, address1: null, city: null, postcode: null, country: null }],
    })
    const result = transformCustomer(customer)
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-02-01T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-20T14:00:00.000Z')
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

  it('handles customer with no addresses key', () => {
    const customer: BagistoCustomer = {
      id: 99,
      first_name: 'Alex',
      last_name: 'Jones',
      email: 'alex@example.com',
    }
    const result = transformCustomer(customer)
    expect(result.id).toBe('99')
    expect(result.addresses).toBeUndefined()
  })

  it('handles null email gracefully', () => {
    const result = transformCustomer(makeCustomer({ email: null }))
    expect(result.email).toBeUndefined()
  })
})

// ── untransformCustomer ───────────────────────────────────────────────────────

describe('untransformCustomer (Bagisto)', () => {
  it('maps first_name, last_name, email, phone', () => {
    const body = untransformCustomer({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      phone: '+1 415 000 5678',
    })
    expect(body['first_name']).toBe('Jane')
    expect(body['last_name']).toBe('Smith')
    expect(body['email']).toBe('jane@example.com')
    expect(body['phone']).toBe('+1 415 000 5678')
  })
})
