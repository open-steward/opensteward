import { describe, it, expect } from 'vitest'
import {
  transformProfile,
  type RawNhnProfile,
} from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawNhnProfile> = {}): RawNhnProfile {
  return {
    memberNo: 12345,
    memberId: 'user123',
    memberName: 'Kim Minji',
    firstName: 'Minji',
    lastName: 'Kim',
    mobileNo: '01012345678',
    email: 'minji@example.com',
    smsAgreed: true,
    address: '서울 강남구 테헤란로 1',
    detailAddress: '101호',
    zipCd: '06234',
    countryCd: 'KR',
    city: 'Seoul',
    joinYmdt: '2024-03-01T00:00:00Z',
    lastLoginYmdt: '2024-03-10T00:00:00Z',
    ...overrides,
  }
}

describe('transformProfile (NHN Commerce)', () => {
  it('maps memberNo to string canonical id', () => {
    const result = transformProfile(makeRaw())
    expect(result.id).toBe('12345')
  })

  it('falls back to memberId when memberNo is undefined', () => {
    const result = transformProfile(makeRaw({ memberNo: undefined }))
    expect(result.id).toBe('user123')
  })

  it('maps email', () => {
    const result = transformProfile(makeRaw())
    expect(result.email).toBe('minji@example.com')
  })

  it('maps memberName to firstName', () => {
    const result = transformProfile(makeRaw())
    expect(result.firstName).toBe('Kim Minji')
  })

  it('maps mobileNo to phone', () => {
    const result = transformProfile(makeRaw())
    expect(result.phone).toBe('01012345678')
  })

  it('maps smsAgreed to acceptsMarketing', () => {
    const result = transformProfile(makeRaw())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps address fields to defaultAddress', () => {
    const result = transformProfile(makeRaw())
    expect(result.defaultAddress).toMatchObject({
      line1: '서울 강남구 테헤란로 1',
      line2: '101호',
      postalCode: '06234',
      country: 'KR',
      city: 'Seoul',
    })
  })

  it('maps joinYmdt to createdAt as ISO string', () => {
    const result = transformProfile(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps lastLoginYmdt to updatedAt as ISO string', () => {
    const result = transformProfile(makeRaw())
    expect(result.updatedAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformProfile(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing address gracefully', () => {
    const result = transformProfile(
      makeRaw({ address: null, zipCd: null, countryCd: null, city: null }),
    )
    expect(result.defaultAddress).toBeUndefined()
  })
})
