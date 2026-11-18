/**
 * ColorMe Shop OAuth — verified directly against the OpenAPI spec's own
 * `info.description` ("利用手順" section), fetched from
 * https://api.shop-pro.jp/v1/spec/open_api.json and parsed, not summarised:
 * authorize URL params, the exact curl example for the token exchange, and
 * the documented response shape (no expires_in, no refresh_token).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { buildAuthUrl, exchangeCode } from '../../../../../../src/verticals/ecommerce/adapters/colorme-shop/auth'

afterEach(() => vi.restoreAllMocks())

describe('buildAuthUrl', () => {
  it('builds the api.shop-pro.jp authorize URL with client_id/redirect_uri/response_type/scope', () => {
    const url = new URL(
      buildAuthUrl('CLIENT_ID', 'https://app.example.com/callback', ['read_products', 'write_products'], 'st'),
    )
    expect(url.origin + url.pathname).toBe('https://api.shop-pro.jp/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('CLIENT_ID')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('read_products write_products')
    expect(url.searchParams.get('state')).toBe('st')
  })

  it('honours an override scope list (read-only Connect Links)', () => {
    const url = new URL(buildAuthUrl('cid', 'https://app.example.com/callback', ['read_sales'], 'st'))
    expect(url.searchParams.get('scope')).toBe('read_sales')
  })
})

describe('exchangeCode', () => {
  it('POSTs form-urlencoded grant_type=authorization_code to oauth/token and never invents an expiry', async () => {
    const post = vi.fn(async (url: string, body: string, cfg: { headers: Record<string, string> }) => {
      expect(url).toBe('https://api.shop-pro.jp/oauth/token')
      expect(cfg.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
      const params = new URLSearchParams(body)
      expect(params.get('client_id')).toBe('CLIENT_ID')
      expect(params.get('client_secret')).toBe('CLIENT_SECRET')
      expect(params.get('code')).toBe('CODE')
      expect(params.get('grant_type')).toBe('authorization_code')
      expect(params.get('redirect_uri')).toBe('REDIRECT_URI')
      return { data: { access_token: 'd461ab8...', token_type: 'bearer', scope: 'read_products write_products' } }
    })
    vi.spyOn(axios, 'post').mockImplementation(post as never)

    const creds = await exchangeCode('CODE', 'REDIRECT_URI', 'CLIENT_ID', 'CLIENT_SECRET')
    expect(creds.accessToken).toBe('d461ab8...')
    expect(creds.expiresAt).toBeUndefined()
    expect(creds.refreshToken).toBeUndefined()
  })
})
