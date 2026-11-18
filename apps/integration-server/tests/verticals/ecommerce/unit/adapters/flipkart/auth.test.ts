/**
 * Flipkart third-party (authorization-code) auth — pinned against
 * https://seller.flipkart.com/api-docs/FMSAPI.html: authorize URL params, and
 * a GET token call with query params and appId:appSecret as HTTP Basic.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { FlipkartAdapter } from '../../../../../../src/verticals/ecommerce/adapters/flipkart'

afterEach(() => vi.restoreAllMocks())

const CONFIG = {
  clientId: 'app-id',
  clientSecret: 'app-secret',
  redirectUri: 'https://os.example.com/auth/ecommerce/flipkart/callback',
}
const BASIC = `Basic ${Buffer.from('app-id:app-secret').toString('base64')}`

describe('FlipkartAdapter.getAuthUrl', () => {
  it('builds the documented authorize URL', () => {
    const url = new URL(new FlipkartAdapter(CONFIG).getAuthUrl('st8'))
    expect(url.origin + url.pathname).toBe('https://api.flipkart.net/oauth-service/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('app-id')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('Seller_Api')
    expect(url.searchParams.get('state')).toBe('st8')
  })

  it('refuses to build an authorize URL without a registered redirectUri', () => {
    expect(() =>
      new FlipkartAdapter({ clientId: 'app-id', clientSecret: 'app-secret' }).getAuthUrl('st8'),
    ).toThrow(/redirectUri/)
  })

  it('replaces the default scope with overrideScopes', () => {
    const url = new URL(new FlipkartAdapter(CONFIG).getAuthUrl('st8', ['custom-scope']))
    expect(url.searchParams.get('scope')).toBe('custom-scope')
  })
})

describe('FlipkartAdapter.exchangeCode', () => {
  it('GETs the token endpoint with grant_type=authorization_code and Basic client auth', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        access_token: 'at-1',
        token_type: 'bearer',
        refresh_token: 'rt-1',
        expires_in: 5183999,
        scope: 'Seller_Api',
        refresh_token_expires_in: 10703805,
      },
    } as never)

    const creds = await new FlipkartAdapter(CONFIG).exchangeCode('the-code', CONFIG.redirectUri)

    expect(get).toHaveBeenCalledTimes(1)
    const [url, cfg] = get.mock.calls[0] as [
      string,
      { params: Record<string, string>; headers: Record<string, string> },
    ]
    expect(url).toBe('https://api.flipkart.net/oauth-service/oauth/token')
    expect(cfg.params).toEqual({
      redirect_uri: CONFIG.redirectUri,
      grant_type: 'authorization_code',
      code: 'the-code',
    })
    expect(cfg.headers['Authorization']).toBe(BASIC)
    expect(creds.accessToken).toBe('at-1')
    expect(creds.refreshToken).toBe('rt-1')
    expect(creds.expiresAt).toBeInstanceOf(Date)
    expect(creds.expiresAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('refuses to exchange without the application credentials', async () => {
    await expect(new FlipkartAdapter({}).exchangeCode('c', 'https://x')).rejects.toThrow(
      /clientId and clientSecret/,
    )
  })
})

describe('FlipkartAdapter.refreshCredentials', () => {
  it('GETs grant_type=refresh_token with Basic client auth and keeps the old refresh token if none returned', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({
      data: { access_token: 'at-2', token_type: 'bearer', expires_in: 3330779 },
    } as never)

    const creds = await new FlipkartAdapter(CONFIG).refreshCredentials({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
    })

    const [url, cfg] = get.mock.calls[0] as [
      string,
      { params: Record<string, string>; headers: Record<string, string> },
    ]
    expect(url).toBe('https://api.flipkart.net/oauth-service/oauth/token')
    expect(cfg.params).toEqual({ grant_type: 'refresh_token', refresh_token: 'rt-1' })
    expect(cfg.headers['Authorization']).toBe(BASIC)
    expect(creds.accessToken).toBe('at-2')
    expect(creds.refreshToken).toBe('rt-1')
  })

  it('fails loudly without a refresh token', async () => {
    await expect(
      new FlipkartAdapter(CONFIG).refreshCredentials({ accessToken: 'at-1' }),
    ).rejects.toThrow(/refresh token/)
  })
})
