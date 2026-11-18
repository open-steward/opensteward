/**
 * NOWPayments authenticates with the `x-api-key` header ("(Required)  Your
 * NOWPayments API key"); the dashboard e-mail and password are optional and
 * only mint the JWT for the payments and customer lists.
 * https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
 */
import { describe, it, expect } from 'vitest'
import {
  buildCredentials,
  dashboardLogin,
} from '../../../../../../src/verticals/payments/adapters/nowpayments/auth'

describe('nowpayments buildCredentials', () => {
  it('requires an API key and never falls back to another field', () => {
    expect(() => buildCredentials({})).toThrow(/API key is required/)
    expect(() => buildCredentials({ secretKey: 'sk' })).toThrow(/API key is required/)
  })

  it('stores the API key as the access token, without a login', () => {
    const c = buildCredentials({ apiKey: 'k' })
    expect(c).toEqual({ accessToken: 'k' })
    expect(dashboardLogin(c)).toBeUndefined()
  })

  it('keeps the optional dashboard e-mail and password for the JWT', () => {
    const c = buildCredentials({ apiKey: 'k', email: 'owner@example.com', password: 'pw' })
    expect(c.accessToken).toBe('k')
    expect(dashboardLogin(c)).toEqual({ email: 'owner@example.com', password: 'pw' })
  })

  it('has no login when only one of e-mail and password is given', () => {
    expect(
      dashboardLogin(buildCredentials({ apiKey: 'k', email: 'owner@example.com' })),
    ).toBeUndefined()
  })
})
