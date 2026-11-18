import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import axios from 'axios'
import {
  computeSignature,
  buildAuthUrl,
  exchangeCode,
  refreshCredentials,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/auth'
import { TOKEN_BUFFER_MS } from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/constants'

describe('computeSignature', () => {
  it('produces correct HMAC-SHA256 hex digest', () => {
    const appSecret = 'my_app_secret'
    const path = '/product/202309/products/search'
    const queryParams = {
      app_key: 'test_app_key',
      timestamp: '1714560000',
      shop_cipher: 'test_cipher',
    }

    const sortedKeys = Object.keys(queryParams)
      .filter((k) => k !== 'sign' && k !== 'access_token')
      .sort()
    const paramString = sortedKeys
      .map((k) => `${k}${queryParams[k as keyof typeof queryParams]}`)
      .join('')
    const baseString = `${appSecret}${path}${paramString}${appSecret}`
    const expected = createHmac('sha256', appSecret).update(baseString).digest('hex')

    const result = computeSignature(appSecret, path, queryParams)
    expect(result).toBe(expected)
  })

  it('produces different signatures for different paths', () => {
    const secret = 'secret'
    const params = { app_key: 'key', timestamp: '1000' }
    const sig1 = computeSignature(secret, '/product/search', params)
    const sig2 = computeSignature(secret, '/order/search', params)
    expect(sig1).not.toBe(sig2)
  })

  it('produces different signatures for different timestamps', () => {
    const secret = 'secret'
    const sig1 = computeSignature(secret, '/test', { app_key: 'key', timestamp: '1000' })
    const sig2 = computeSignature(secret, '/test', { app_key: 'key', timestamp: '2000' })
    expect(sig1).not.toBe(sig2)
  })

  it('excludes sign and access_token from signature computation', () => {
    const secret = 'secret'
    const params1 = { app_key: 'key', timestamp: '1000' }
    const params2 = {
      app_key: 'key',
      timestamp: '1000',
      sign: 'should_be_ignored',
      access_token: 'also_ignored',
    }
    const sig1 = computeSignature(secret, '/test', params1)
    const sig2 = computeSignature(secret, '/test', params2)
    expect(sig1).toBe(sig2)
  })

  it('includes body in signature when provided', () => {
    const secret = 'secret'
    const params = { app_key: 'key', timestamp: '1000' }
    const sig1 = computeSignature(secret, '/test', params)
    const sig2 = computeSignature(secret, '/test', params, '{"key":"value"}')
    expect(sig1).not.toBe(sig2)
  })
})

describe('buildAuthUrl', () => {
  it('returns a URL with required query parameters', () => {
    const url = buildAuthUrl('test_app_key', 'https://example.com/callback')
    expect(url).toContain('tiktokshop.com')
    expect(url).toContain('app_key=test_app_key')
  })

  it('includes the authorize path', () => {
    const url = buildAuthUrl('key', 'https://cb.test')
    expect(url).toContain('/open/authorize')
  })
})

/**
 * The Authorization overview (partner.tiktokshop.com/docv2/page/678e3a3292b0f40314a92d75):
 * "Token endpoints (all markets) | `https://auth.tiktok-shops.com/api/v2/token/get`
 * and `.../token/refresh`", and "`data.access_token_expire_in` | Unix timestamp |
 * Access token expiration (default validity: **7 days**). | 1660556783".
 */
describe('token calls', () => {
  afterEach(() => vi.restoreAllMocks())

  // The documented response sample's values.
  const TOKEN_DATA = {
    access_token: 'TTP_RLM6CIADWF606TZGFO5XGA',
    access_token_expire_in: 1660556783,
    refresh_token: 'TTP_C2XWDN63ON-FOHJSMR0WSG',
    refresh_token_expire_in: 1691487031,
    open_id: '7010736057180325637',
  }

  it('exchangeCode GETs the token host and reads expire_in as an instant', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { code: 0, message: 'success', data: TOKEN_DATA } })
    const creds = await exchangeCode('TTP_FeBoANmHP3yqdoUI9fZOCw', 'ak', 'as')
    expect(get.mock.calls[0]![0]).toBe('https://auth.tiktok-shops.com/api/v2/token/get')
    expect(get.mock.calls[0]![1]!.params).toEqual({
      app_key: 'ak',
      app_secret: 'as',
      auth_code: 'TTP_FeBoANmHP3yqdoUI9fZOCw',
      grant_type: 'authorized_code',
    })
    expect(creds.expiresAt).toEqual(new Date(1660556783 * 1000 - TOKEN_BUFFER_MS))
  })

  it('refreshCredentials GETs the token host and reads expire_in as an instant', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { code: 0, message: 'success', data: TOKEN_DATA } })
    const creds = await refreshCredentials({
      accessToken: 'old',
      refreshToken: 'TTP_C2XWDN63ON-FOHJSMR0WSG',
      extra: { appKey: 'ak', appSecret: 'as' },
    })
    expect(get.mock.calls[0]![0]).toBe('https://auth.tiktok-shops.com/api/v2/token/refresh')
    expect(get.mock.calls[0]![1]!.params).toMatchObject({ grant_type: 'refresh_token' })
    expect(creds.expiresAt).toEqual(new Date(1660556783 * 1000 - TOKEN_BUFFER_MS))
  })
})
