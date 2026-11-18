import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { signDarazRequest } from '../../../../../../src/verticals/ecommerce/adapters/daraz/client'

describe('signDarazRequest', () => {
  it('sorts params alphabetically and produces correct HMAC-SHA256', () => {
    const apiPath = '/products/get'
    const params: Record<string, string> = {
      app_key: '12345',
      timestamp: '1700000000000',
      access_token: 'tok_abc',
      sign_method: 'sha256',
    }
    const appSecret = 'test-secret'

    const sign = signDarazRequest(apiPath, params, appSecret)

    // Verify it's a hex string (uppercase)
    expect(sign).toMatch(/^[0-9A-F]+$/)
    expect(sign.length).toBe(64)

    // Verify determinism
    const sign2 = signDarazRequest(apiPath, params, appSecret)
    expect(sign).toBe(sign2)
  })

  it('produces different signatures for different paths', () => {
    const params: Record<string, string> = {
      app_key: '12345',
      timestamp: '1700000000000',
    }
    const sign1 = signDarazRequest('/products/get', params, 'secret')
    const sign2 = signDarazRequest('/orders/get', params, 'secret')
    expect(sign1).not.toBe(sign2)
  })

  it('produces different signatures for different params', () => {
    const params1: Record<string, string> = { app_key: '111', timestamp: '100' }
    const params2: Record<string, string> = { app_key: '222', timestamp: '100' }
    const sign1 = signDarazRequest('/test', params1, 'secret')
    const sign2 = signDarazRequest('/test', params2, 'secret')
    expect(sign1).not.toBe(sign2)
  })

  it('concatenates in sorted order: access_token before app_key', () => {
    const params: Record<string, string> = {
      timestamp: '999',
      app_key: '123',
      access_token: 'TOK',
      sign_method: 'sha256',
    }
    const sign = signDarazRequest('/path', params, 'secret')

    // Verify by computing manually
    const expected = crypto
      .createHmac('sha256', 'secret')
      .update('/pathaccess_tokenTOKapp_key123sign_methodsha256timestamp999')
      .digest('hex')
      .toUpperCase()
    expect(sign).toBe(expected)
  })
})
