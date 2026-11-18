import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawNuveiGetUserDetailsResponse,
} from '../../../../../../../src/verticals/payments/adapters/nuvei/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('nuvei transformCustomer', () => {
  it('maps userTokenId, email, and name from userDetails to canonical customer', () => {
    const raw: RawNuveiGetUserDetailsResponse = {
      userTokenId: 'user_token_abc',
      userDetails: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.com',
        phone: '+14155550123',
        address: '123 Main St',
        city: 'Anytown',
        zip: '12345',
        state: 'CA',
        countryCode: 'US',
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('user_token_abc')
    expect(result.externalId).toBe('user_token_abc')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.phone).toBe('+14155550123')
    expect(result.gateway).toBe('nuvei')
    expect(result.billingAddress?.line1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Anytown')
    expect(result.billingAddress?.country).toBe('US')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to userDetails.userTokenId then userId for id when top-level userTokenId is absent', () => {
    const raw: RawNuveiGetUserDetailsResponse = {
      userDetails: {
        userTokenId: 'nested_token',
        email: 'anon@example.com',
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('nested_token')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to userId when userTokenId is absent at all levels', () => {
    const raw: RawNuveiGetUserDetailsResponse = {
      userDetails: {
        userId: 'user_id_xyz',
        email: 'user@example.com',
      },
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('user_id_xyz')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits name when firstName and lastName are both absent', () => {
    const raw: RawNuveiGetUserDetailsResponse = {
      userTokenId: 'tok_noname',
      userDetails: {
        email: 'noname@example.com',
      },
    }
    const result = transformCustomer(raw)
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits billingAddress when address, city, and countryCode are all absent', () => {
    const raw: RawNuveiGetUserDetailsResponse = {
      userTokenId: 'tok_noaddr',
      userDetails: {
        email: 'noaddr@example.com',
        zip: '12345',
        state: 'CA',
      },
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing userDetails gracefully', () => {
    const raw: RawNuveiGetUserDetailsResponse = {
      userTokenId: 'tok_empty',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('tok_empty')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('stores locale and birthdate in metadata', () => {
    const raw: RawNuveiGetUserDetailsResponse = {
      userTokenId: 'tok_meta',
      userDetails: {
        email: 'meta@example.com',
        locale: 'en_US',
        birthdate: '1990-01-15',
        userId: 'u_42',
        county: 'Los Angeles',
      },
    }
    const result = transformCustomer(raw)
    expect(result.metadata.locale).toBe('en_US')
    expect(result.metadata.birthdate).toBe('1990-01-15')
    expect(result.metadata.userId).toBe('u_42')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
