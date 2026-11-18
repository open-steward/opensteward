import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawMagentoCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawMagentoCustomer> = {}): RawMagentoCustomer {
  return {
    id: 7001,
    group_id: 1,
    created_at: '2024-04-01T08:00:00.000Z',
    updated_at: '2024-04-02T09:00:00.000Z',
    email: 'ada@example.com',
    firstname: 'Ada',
    lastname: 'Lovelace',
    store_id: 1,
    website_id: 1,
    addresses: [
      {
        id: 10,
        customer_id: 7001,
        default_billing: true,
        default_shipping: true,
        firstname: 'Ada',
        lastname: 'Lovelace',
        street: ['1 Programming Ln', 'Apt 2'],
        city: 'London',
        region: { region: 'England', region_code: 'ENG' },
        postcode: 'NW1 2AB',
        country_id: 'GB',
        telephone: '+44 20 7946 0000',
      },
    ],
    ...overrides,
  }
}

describe('transformCustomer (Magento)', () => {
  it('maps canonical identity fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+44 20 7946 0000')
  })

  it('maps the default billing address and full address list', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toEqual({
      line1: '1 Programming Ln',
      line2: 'Apt 2',
      city: 'London',
      region: 'England',
      postalCode: 'NW1 2AB',
      country: 'GB',
    })
    expect(result.addresses).toHaveLength(1)
  })

  it('handles customers with no addresses gracefully', () => {
    const result = transformCustomer(makeCustomer({ addresses: [] }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })

  it('preserves raw payload in metadata unmodified', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical) as { customer: Record<string, unknown> }
    expect(body.customer['email']).toBe('ada@example.com')
    expect(body.customer['firstname']).toBe('Ada')
    const addresses = body.customer['addresses'] as Array<Record<string, unknown>>
    expect(addresses[0]!['postcode']).toBe('NW1 2AB')
    expect(addresses[0]!['country_id']).toBe('GB')
  })
})
