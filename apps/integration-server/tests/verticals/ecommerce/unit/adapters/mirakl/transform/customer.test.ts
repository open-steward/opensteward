import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawMiraklCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/mirakl/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawMiraklCustomer> = {}): RawMiraklCustomer {
  return {
    customer_id: 'CUST-42',
    email: 'buyer@example.com',
    billing_address: {
      firstname: 'Jean',
      lastname: 'Dupont',
      street_1: '12 Rue de Rivoli',
      city: 'Paris',
      zip_code: '75001',
      country_iso_code: 'FR',
      phone: '+33123456789',
    },
    shipping_address: {
      firstname: 'Jean',
      lastname: 'Dupont',
      street_1: '34 Avenue Montaigne',
      city: 'Paris',
      zip_code: '75008',
      country_iso_code: 'FR',
    },
    ...overrides,
  }
}

describe('transformCustomer (Mirakl)', () => {
  it('maps customer_id to canonical id', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('CUST-42')
  })

  it('maps email from top-level field', () => {
    const result = transformCustomer(makeRaw())
    expect(result.email).toBe('buyer@example.com')
  })

  it('maps first and last name from billing_address', () => {
    const result = transformCustomer(makeRaw())
    expect(result.firstName).toBe('Jean')
    expect(result.lastName).toBe('Dupont')
  })

  it('maps phone from billing_address.phone', () => {
    const result = transformCustomer(makeRaw())
    expect(result.phone).toBe('+33123456789')
  })

  it('maps defaultAddress from billing_address', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress).toMatchObject({
      line1: '12 Rue de Rivoli',
      city: 'Paris',
      postalCode: '75001',
      country: 'FR',
    })
  })

  it('includes both billing and shipping in addresses array', () => {
    const result = transformCustomer(makeRaw())
    expect(result.addresses).toHaveLength(2)
  })

  it('stores orderId in metadata.sourceOrderId when provided', () => {
    const result = transformCustomer(makeRaw(), 'ORDER-999')
    expect((result.metadata as Record<string, unknown>)['sourceOrderId']).toBe('ORDER-999')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing billing_address gracefully', () => {
    const result = transformCustomer(makeRaw({ billing_address: null }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.firstName).toBeUndefined()
  })
})
