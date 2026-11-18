import { describe, it, expect } from 'vitest'
import { buildCredentials } from '../../../../../../src/verticals/payments/adapters/rebill/auth'

describe('rebill buildCredentials', () => {
  it('stores the apiKey field as the access token', () => {
    expect(buildCredentials({ apiKey: 'sk_live_abc' })).toEqual({ accessToken: 'sk_live_abc' })
  })

  it('does not fall back to an undeclared secretKey field', () => {
    expect(() => buildCredentials({ secretKey: 'sk_live_abc' })).toThrow(/API key/)
  })

  it('refuses an empty key instead of storing an empty token', () => {
    expect(() => buildCredentials({ apiKey: '' })).toThrow(/API key/)
    expect(() => buildCredentials({})).toThrow(/API key/)
  })
})
