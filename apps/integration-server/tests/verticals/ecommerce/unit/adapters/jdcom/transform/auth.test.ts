import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  computeSignature,
  buildAuthUrl,
} from '../../../../../../../src/verticals/ecommerce/adapters/jdcom/auth'

describe('computeSignature', () => {
  it('produces correct MD5 hex digest (uppercase)', () => {
    const appSecret = 'my_app_secret'
    const params: Record<string, string> = {
      method: 'jingdong.sku.read',
      app_key: '123456',
      access_token: 'test_token',
      timestamp: '2024-01-01 00:00:00',
      v: '2.0',
      '360buy_param_json': '{"sku_id":100}',
    }

    // Manually compute expected: appSecret + sorted(key+value) + appSecret
    const sorted = Object.keys(params).sort()
    let concatenated = appSecret
    for (const key of sorted) {
      concatenated += key + params[key]
    }
    concatenated += appSecret

    const expected = crypto.createHash('md5').update(concatenated).digest('hex').toUpperCase()

    const result = computeSignature(params, appSecret)
    expect(result).toBe(expected)
  })

  it('produces different signatures for different methods', () => {
    const secret = 'secret'
    const baseParams = {
      app_key: '123',
      access_token: 'tok',
      timestamp: '2024-01-01 00:00:00',
      v: '2.0',
    }
    const sig1 = computeSignature({ ...baseParams, method: 'jingdong.sku.read' }, secret)
    const sig2 = computeSignature({ ...baseParams, method: 'jingdong.order.read' }, secret)
    expect(sig1).not.toBe(sig2)
  })

  it('produces different signatures for different secrets', () => {
    const params = { method: 'jingdong.sku.read', app_key: '123' }
    const sig1 = computeSignature(params, 'secret1')
    const sig2 = computeSignature(params, 'secret2')
    expect(sig1).not.toBe(sig2)
  })

  it('wraps appSecret around the concatenation', () => {
    const appSecret = 'WRAP'
    const params = { b: '2', a: '1' }

    // Expected: WRAP + a1 + b2 + WRAP (sorted)
    const expected = crypto
      .createHash('md5')
      .update('WRAPa1b2WRAP')
      .digest('hex')
      .toUpperCase()

    expect(computeSignature(params, appSecret)).toBe(expected)
  })

  it('sorts parameters alphabetically', () => {
    const secret = 'sec'
    const params = { z_param: 'last', a_param: 'first', m_param: 'middle' }
    const result = computeSignature(params, secret)

    // Verify by manually building in sorted order
    const expected = crypto
      .createHash('md5')
      .update('sec' + 'a_param' + 'first' + 'm_param' + 'middle' + 'z_param' + 'last' + 'sec')
      .digest('hex')
      .toUpperCase()

    expect(result).toBe(expected)
  })

  it('returns uppercase hex string', () => {
    const result = computeSignature({ test: 'value' }, 'secret')
    expect(result).toMatch(/^[0-9A-F]{32}$/)
  })
})

describe('buildAuthUrl', () => {
  it('returns a URL with required query parameters', () => {
    const url = buildAuthUrl('my_app_key', 'https://example.com/callback', 'test_state')
    expect(url).toContain('oauth.jd.com/oauth/authorize')
    expect(url).toContain('client_id=my_app_key')
    expect(url).toContain('redirect_uri=')
    expect(url).toContain('response_type=code')
    expect(url).toContain('state=test_state')
  })

  it('includes the authorization path', () => {
    const url = buildAuthUrl('key', 'https://cb.test')
    expect(url).toContain('/oauth/authorize')
  })

  it('uses empty state when not provided', () => {
    const url = buildAuthUrl('key', 'https://cb.test')
    expect(url).toContain('state=')
  })
})
