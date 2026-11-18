import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  computeSignature,
  computeAuthSignature,
  buildAuthUrl,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopee/auth'

describe('computeSignature', () => {
  it('produces correct HMAC-SHA256 hex digest', () => {
    const partnerKey = 'my_partner_key'
    const partnerId = 123456
    const apiPath = '/api/v2/product/get_item_list'
    const timestamp = 1714560000
    const accessToken = 'test_access_token'
    const shopId = 78901

    const expected = createHmac('sha256', partnerKey)
      .update(`${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`)
      .digest('hex')

    const result = computeSignature(
      partnerKey,
      partnerId,
      apiPath,
      timestamp,
      accessToken,
      shopId,
    )
    expect(result).toBe(expected)
  })

  it('produces different signatures for different paths', () => {
    const key = 'secret'
    const sig1 = computeSignature(key, 1, '/api/v2/product/get_item_list', 1000, 'tok', 2)
    const sig2 = computeSignature(key, 1, '/api/v2/order/get_order_list', 1000, 'tok', 2)
    expect(sig1).not.toBe(sig2)
  })

  it('produces different signatures for different timestamps', () => {
    const key = 'secret'
    const sig1 = computeSignature(key, 1, '/api/v2/test', 1000, 'tok', 2)
    const sig2 = computeSignature(key, 1, '/api/v2/test', 2000, 'tok', 2)
    expect(sig1).not.toBe(sig2)
  })

  it('produces different signatures for different shop ids', () => {
    const key = 'secret'
    const sig1 = computeSignature(key, 1, '/api/v2/test', 1000, 'tok', 100)
    const sig2 = computeSignature(key, 1, '/api/v2/test', 1000, 'tok', 200)
    expect(sig1).not.toBe(sig2)
  })
})

describe('computeAuthSignature', () => {
  it('produces HMAC without access_token or shop_id', () => {
    const partnerKey = 'my_partner_key'
    const partnerId = 123456
    const apiPath = '/api/v2/auth/token/get'
    const timestamp = 1714560000

    const expected = createHmac('sha256', partnerKey)
      .update(`${partnerId}${apiPath}${timestamp}`)
      .digest('hex')

    const result = computeAuthSignature(partnerKey, partnerId, apiPath, timestamp)
    expect(result).toBe(expected)
  })
})

describe('buildAuthUrl', () => {
  it('returns a URL with required query parameters', () => {
    const url = buildAuthUrl(123456, 'https://example.com/callback', 'partner_key')
    expect(url).toContain('partner.shopeemobile.com')
    expect(url).toContain('partner_id=123456')
    expect(url).toContain('redirect=')
    expect(url).toContain('timestamp=')
    expect(url).toContain('sign=')
  })

  it('includes the auth_partner path', () => {
    const url = buildAuthUrl(1, 'https://cb.test', 'key')
    expect(url).toContain('/api/v2/shop/auth_partner')
  })
})
