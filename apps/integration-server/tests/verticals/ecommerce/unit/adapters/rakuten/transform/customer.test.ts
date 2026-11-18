import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  splitName,
  deriveCustomerId,
  type RakutenCustomerSource,
} from '../../../../../../../src/verticals/ecommerce/adapters/rakuten/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomerSource(
  overrides: Partial<RakutenCustomerSource> = {},
): RakutenCustomerSource {
  return {
    ordererName: '田中 太郎',
    ordererNameKana: 'タナカ タロウ',
    ordererZipCode: '150-0001',
    ordererPrefecture: '東京都',
    ordererAddress: '渋谷区神宮前1-1-1',
    ordererAddressB: 'マンション101号室',
    ordererPhoneNumber1: '03-1234-5678',
    ordererMailAddress: 'taro.tanaka@example.com',
    _id: 'email:taro.tanaka@example.com',
    _orderNumbers: ['ORDER-001'],
    ...overrides,
  }
}

describe('transformCustomer (Rakuten)', () => {
  it('uses _id as the canonical id', () => {
    const result = transformCustomer(makeCustomerSource())
    expect(result.id).toBe('email:taro.tanaka@example.com')
  })

  it('maps email from ordererMailAddress', () => {
    const result = transformCustomer(makeCustomerSource())
    expect(result.email).toBe('taro.tanaka@example.com')
  })

  it('maps phone from ordererPhoneNumber1', () => {
    const result = transformCustomer(makeCustomerSource())
    expect(result.phone).toBe('03-1234-5678')
  })

  it('splits Japanese name into lastName + firstName', () => {
    const result = transformCustomer(makeCustomerSource())
    expect(result.lastName).toBe('田中')
    expect(result.firstName).toBe('太郎')
  })

  it('builds default address from ordererInfo', () => {
    const result = transformCustomer(makeCustomerSource())
    expect(result.defaultAddress).toMatchObject({
      line1: '渋谷区神宮前1-1-1',
      line2: 'マンション101号室',
      region: '東京都',
      postalCode: '150-0001',
      country: 'JP',
    })
  })

  it('includes addresses array matching defaultAddress', () => {
    const result = transformCustomer(makeCustomerSource())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]).toEqual(result.defaultAddress)
  })

  it('omits defaultAddress when no address fields present', () => {
    const result = transformCustomer(
      makeCustomerSource({
        ordererAddress: undefined,
        ordererAddressB: undefined,
        ordererPrefecture: undefined,
        ordererZipCode: undefined,
      }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeCustomerSource()
    const result = transformCustomer(raw)
    expect(result.metadata['ordererMailAddress']).toBe('taro.tanaka@example.com')
    expect(result.metadata['_orderNumbers']).toEqual(['ORDER-001'])
  })

  it('satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomerSource())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles customer with no email', () => {
    const result = transformCustomer(
      makeCustomerSource({ ordererMailAddress: undefined, _id: 'name:田中 太郎' }),
    )
    expect(result.id).toBe('name:田中 太郎')
    expect(result.email).toBeUndefined()
  })

  it('handles customer with line2 absent', () => {
    const result = transformCustomer(makeCustomerSource({ ordererAddressB: undefined }))
    expect(result.defaultAddress?.line2).toBeUndefined()
  })
})

describe('splitName (Rakuten)', () => {
  it('splits family + given name on space', () => {
    expect(splitName('田中 太郎')).toEqual({ lastName: '田中', firstName: '太郎' })
  })

  it('returns lastName only when no space', () => {
    expect(splitName('Nakamura')).toEqual({ lastName: 'Nakamura' })
  })

  it('handles leading/trailing whitespace', () => {
    // trim() removes outer whitespace; split on first inner space
    const result = splitName('  Smith  John  ')
    expect(result.lastName).toBe('Smith')
    expect(result.firstName).toBe(' John')
  })

  it('returns empty object for undefined', () => {
    expect(splitName(undefined)).toEqual({})
  })

  it('returns empty lastName for empty string', () => {
    const result = splitName('')
    expect(result.lastName).toBeUndefined()
    expect(result.firstName).toBeUndefined()
  })
})

describe('deriveCustomerId (Rakuten)', () => {
  it('prefers _id when present', () => {
    expect(deriveCustomerId({ _id: 'email:test@example.com' })).toBe('email:test@example.com')
  })

  it('falls back to email when _id absent', () => {
    expect(
      deriveCustomerId({ ordererMailAddress: 'user@example.com' }),
    ).toBe('email:user@example.com')
  })

  it('falls back to name when email absent', () => {
    expect(deriveCustomerId({ ordererName: '山田 花子' })).toBe('name:山田 花子')
  })

  it('returns fallback string when all fields absent', () => {
    expect(deriveCustomerId({})).toBe('rakuten-unknown-customer')
  })
})
