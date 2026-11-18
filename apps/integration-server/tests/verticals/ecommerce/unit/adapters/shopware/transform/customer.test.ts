import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopwareCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawShopwareCustomer> = {}): RawShopwareCustomer {
  return {
    id: 'cust-001',
    customerNumber: 'C-1001',
    email: 'hans@example.de',
    firstName: 'Hans',
    lastName: 'Mueller',
    active: true,
    guest: false,
    orderCount: 12,
    defaultBillingAddress: {
      id: 'addr-1',
      street: 'Hauptstrasse 42',
      additionalAddressLine1: 'Apt 3B',
      zipcode: '10115',
      city: 'Berlin',
      country: { iso: 'DE', name: 'Germany' },
      countryState: { shortCode: 'DE-BE', name: 'Berlin' },
      phoneNumber: '+49 30 1234567',
    },
    addresses: [
      {
        id: 'addr-1',
        street: 'Hauptstrasse 42',
        additionalAddressLine1: 'Apt 3B',
        zipcode: '10115',
        city: 'Berlin',
        country: { iso: 'DE', name: 'Germany' },
        countryState: { shortCode: 'DE-BE', name: 'Berlin' },
        phoneNumber: '+49 30 1234567',
      },
    ],
    createdAt: '2024-01-05T08:00:00+00:00',
    updatedAt: '2024-06-15T12:00:00+00:00',
    ...overrides,
  }
}

describe('transformCustomer (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('hans@example.de')
    expect(result.firstName).toBe('Hans')
    expect(result.lastName).toBe('Mueller')
    expect(result.phone).toBe('+49 30 1234567')
    expect(result.ordersCount).toBe(12)
  })

  it('maps default billing address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toMatchObject({
      line1: 'Hauptstrasse 42',
      line2: 'Apt 3B',
      city: 'Berlin',
      region: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    })
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]!.city).toBe('Berlin')
  })

  it('handles missing default address', () => {
    const result = transformCustomer(makeCustomer({ defaultBillingAddress: null }))
    // Should fall back to first address from addresses array
    expect(result.defaultAddress?.city).toBe('Berlin')
  })

  it('handles no addresses at all', () => {
    const result = transformCustomer(
      makeCustomer({ defaultBillingAddress: null, addresses: [] }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('validates against CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Shopware)', () => {
  it('maps canonical fields to Shopware shape', () => {
    const body = untransformCustomer({
      email: 'greta@example.de',
      firstName: 'Greta',
      lastName: 'Schmidt',
      phone: '+49 30 9876543',
      defaultAddress: {
        line1: 'Friedrichstrasse 1',
        city: 'Berlin',
        postalCode: '10117',
        country: 'DE',
      },
    })
    expect(body['email']).toBe('greta@example.de')
    expect(body['firstName']).toBe('Greta')
    const addr = body['defaultBillingAddress'] as Record<string, unknown>
    expect(addr['street']).toBe('Friedrichstrasse 1')
    expect(addr['city']).toBe('Berlin')
  })
})
