import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawEposNowCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawEposNowCustomer> = {}): RawEposNowCustomer {
  return {
    Id: 5001,
    FirstName: 'Ada',
    LastName: 'Lovelace',
    EmailAddress: 'ada@example.com',
    PhoneNumber: '+44 20 7946 0958',
    OptInMarketing: true,
    Address1: '10 Downing Street',
    Address2: 'Flat 2',
    Town: 'London',
    County: 'Greater London',
    PostCode: 'SW1A 2AA',
    Country: 'GB',
    CreatedDate: '2024-01-15T10:00:00Z',
    LastUpdatedDate: '2024-06-01T08:30:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Epos Now)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('5001')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+44 20 7946 0958')
  })

  it('maps address fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('10 Downing Street')
    expect(result.defaultAddress?.line2).toBe('Flat 2')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.region).toBe('Greater London')
    expect(result.defaultAddress?.postalCode).toBe('SW1A 2AA')
    expect(result.defaultAddress?.country).toBe('GB')
  })

  it('maps marketing preferences', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBe(true)
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

  it('handles missing optional fields', () => {
    const minimal: RawEposNowCustomer = { Id: 9999 }
    const result = transformCustomer(minimal)
    expect(result.id).toBe('9999')
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (Epos Now)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw['FirstName']).toBe('Ada')
    expect(raw['LastName']).toBe('Lovelace')
    expect(raw['EmailAddress']).toBe('ada@example.com')
    expect(raw['PhoneNumber']).toBe('+44 20 7946 0958')
  })

  it('maps address fields back', () => {
    const raw = untransformCustomer({
      defaultAddress: {
        line1: '10 Downing Street',
        city: 'London',
        postalCode: 'SW1A 2AA',
        country: 'GB',
      },
    })
    expect(raw['Address1']).toBe('10 Downing Street')
    expect(raw['Town']).toBe('London')
    expect(raw['PostCode']).toBe('SW1A 2AA')
    expect(raw['Country']).toBe('GB')
  })

  it('maps marketing opt-in', () => {
    const raw = untransformCustomer({ acceptsMarketing: false })
    expect(raw['OptInMarketing']).toBe(false)
  })
})
