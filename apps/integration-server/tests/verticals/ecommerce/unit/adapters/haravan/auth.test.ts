/**
 * Haravan OAuth — verified against the raw HTML of
 * https://docs.haravan.com/docs/get-started/create-app/ Steps 2-3 (curl
 * examples, not a summarised page): authorize URL host/params, token
 * endpoint, form-encoded body, and the documented (optional) refresh_token /
 * ~15-year expires_in shape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { buildAuthUrl, exchangeCode, refreshAccessToken } from '../../../../../../src/verticals/ecommerce/adapters/haravan/auth'

afterEach(() => vi.restoreAllMocks())

describe('buildAuthUrl', () => {
  it('builds the accounts.haravan.com authorize URL with response_mode/response_type/scope/client_id/redirect_uri/state', () => {
    const url = new URL(
      buildAuthUrl('cid', 'https://app.example.com/callback', ['com.read_products', 'com.write_products'], 'st8'),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.haravan.com/connect/authorize')
    expect(url.searchParams.get('response_mode')).toBe('query')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('com.read_products com.write_products')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/callback')
    expect(url.searchParams.get('state')).toBe('st8')
  })

  it('honours an override scope list (read-only Connect Links)', () => {
    const url = new URL(buildAuthUrl('cid', 'https://app.example.com/callback', ['com.read_orders'], 'st'))
    expect(url.searchParams.get('scope')).toBe('com.read_orders')
  })
})

describe('exchangeCode', () => {
  it('POSTs form-urlencoded grant_type=authorization_code to connect/token', async () => {
    const post = vi.fn(async (url: string, body: string, cfg: { headers: Record<string, string> }) => {
      expect(url).toBe('https://accounts.haravan.com/connect/token')
      expect(cfg.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
      const params = new URLSearchParams(body)
      expect(params.get('grant_type')).toBe('authorization_code')
      expect(params.get('client_id')).toBe('cid')
      expect(params.get('client_secret')).toBe('sec')
      expect(params.get('code')).toBe('abc')
      expect(params.get('redirect_uri')).toBe('https://app.example.com/callback')
      return {
        data: {
          access_token: 'CCF8...',
          id_token: 'eyJh...',
          token_type: 'Bearer',
          expires_in: 473040000,
          scope: 'openid org profile userinfo com.write_products com.read_products grant_service',
        },
      }
    })
    vi.spyOn(axios, 'post').mockImplementation(post as never)

    const creds = await exchangeCode('abc', 'https://app.example.com/callback', 'cid', 'sec')
    expect(creds.accessToken).toBe('CCF8...')
    // No refresh_token in this response → no expiresAt either (see auth.ts doc comment).
    expect(creds.refreshToken).toBeUndefined()
    expect(creds.expiresAt).toBeUndefined()
  })

  it('sets expiresAt only when a refresh_token is also issued', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', expires_in: 3600, refresh_token: 'rt1' },
    } as never)
    const creds = await exchangeCode('abc', 'https://app.example.com/callback', 'cid', 'sec')
    expect(creds.refreshToken).toBe('rt1')
    expect(creds.expiresAt).toBeInstanceOf(Date)
  })
})

describe('refreshAccessToken', () => {
  it('POSTs grant_type=refresh_token', async () => {
    const post = vi.fn(async (_url: string, body: string) => {
      const params = new URLSearchParams(body)
      expect(params.get('grant_type')).toBe('refresh_token')
      expect(params.get('refresh_token')).toBe('rt1')
      return { data: { access_token: 'tok2', refresh_token: 'rt2', expires_in: 3600 } }
    })
    vi.spyOn(axios, 'post').mockImplementation(post as never)
    const creds = await refreshAccessToken('rt1', 'cid', 'sec')
    expect(creds.accessToken).toBe('tok2')
  })
})
