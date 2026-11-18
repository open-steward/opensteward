import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawKauflandBuyer,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeBuyer(overrides: Partial<RawKauflandBuyer> = {}): RawKauflandBuyer {
  return {
    id_buyer: 55,
    email: 'jane.doe@example.com',
    billing_address: {
      first_name: 'Jane',
      last_name: 'Doe',
      street: 'Hauptstrasse',
      house_number: '12',
      postcode: '10115',
      city: 'Berlin',
      country: 'DE',
      phone: '+49301234567',
      additional_field: 'Apt 3',
    },
    ...overrides,
  }
}

describe('transformCustomer (kaufland-marketplace)', () => {
  it('maps id_buyer to string id', () => {
    const result = transformCustomer(makeBuyer({ id_buyer: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps email', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('maps billing_address first_name to firstName', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.firstName).toBe('Jane')
  })

  it('maps billing_address last_name to lastName', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.lastName).toBe('Doe')
  })

  it('maps billing_address phone', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.phone).toBe('+49301234567')
  })

  it('concatenates street and house_number into address.line1', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.defaultAddress?.line1).toBe('Hauptstrasse 12')
  })

  it('maps additional_field to address.line2', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.defaultAddress?.line2).toBe('Apt 3')
  })

  it('maps postcode to address.postalCode', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.defaultAddress?.postalCode).toBe('10115')
  })

  it('maps city to address.city', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.defaultAddress?.city).toBe('Berlin')
  })

  it('maps country to address.country', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.defaultAddress?.country).toBe('DE')
  })

  it('sets defaultAddress and addresses to undefined when billing_address is missing', () => {
    const result = transformCustomer(makeBuyer({ billing_address: null }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('populates addresses array with the default address', () => {
    const result = transformCustomer(makeBuyer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses?.[0]).toEqual(result.defaultAddress)
  })

  it('returns empty string id when id_buyer is null', () => {
    const result = transformCustomer(makeBuyer({ id_buyer: null }))
    expect(result.id).toBe('')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeBuyer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeBuyer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
