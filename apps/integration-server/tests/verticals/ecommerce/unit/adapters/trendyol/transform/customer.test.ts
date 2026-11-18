import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawTrendyolOrderCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(
  overrides: Partial<RawTrendyolOrderCustomer> = {},
): RawTrendyolOrderCustomer {
  return {
    customerId: 12345,
    customerFirstName: 'Ahmet',
    customerLastName: 'Yilmaz',
    customerEmail: 'ahmet@example.com',
    phone: '+905551234567',
    address: {
      address1: 'Bağdat Caddesi No:10',
      city: 'Istanbul',
      postalCode: '34740',
      countryCode: 'TR',
    },
    ...overrides,
  }
}

describe('transformCustomer (Trendyol)', () => {
  it('maps id, email, firstName, lastName, phone', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.id).toBe('12345')
    expect(result.email).toBe('ahmet@example.com')
    expect(result.firstName).toBe('Ahmet')
    expect(result.lastName).toBe('Yilmaz')
    expect(result.phone).toBe('+905551234567')
  })

  it('maps address fields from nested address object', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('Bağdat Caddesi No:10')
    expect(result.defaultAddress?.city).toBe('Istanbul')
    expect(result.defaultAddress?.postalCode).toBe('34740')
    expect(result.defaultAddress?.country).toBe('TR')
  })

  it('synthesizes id from email when customerId is absent', () => {
    const raw = makeCustomer({ customerId: null })
    const result = transformCustomer(raw)
    expect(result.id).toBe('trendyol-ahmet@example.com')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits defaultAddress when address has no useful fields', () => {
    const raw = makeCustomer({ address: null })
    const result = transformCustomer(raw)
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })
})
