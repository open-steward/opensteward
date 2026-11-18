/**
 * Alibaba.com signing and seller authorization.
 *
 * docId=61 ("HTTP request sample",
 * https://openapi.alibaba.com/handler/share/doc/getDocDetail.json?docId=61)
 * works one call end to end: app_key "12345678", timestamp "1517820392000",
 * sign_method "sha256", simplify "true", code "3_500102_JxZ05Ux3cnnSSUm6dCxYg6Q26",
 * App Secret "helloworld", API /auth/token/create → "example sign is
 * 0B409A354C6FB222EE2C8095002ACDB2D30566151D1A2361AEE7D2627B9BCBEA", sent to
 * https://openapi-api.alibaba.com/rest/auth/token/create.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  buildAuthUrl,
  buildSign,
  buildSignedParams,
  exchangeCode,
  refreshCredentials,
} from '../../../../../../src/verticals/ecommerce/adapters/alibaba/auth'
import { AlibabaAdapter } from '../../../../../../src/verticals/ecommerce/adapters/alibaba/index'
import { TOKEN_CREATE } from './fixtures'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('alibaba signing (docId=60, docId=61)', () => {
  it('reproduces the documented example signature', () => {
    const sign = buildSign(
      '/auth/token/create',
      {
        app_key: '12345678',
        code: '3_500102_JxZ05Ux3cnnSSUm6dCxYg6Q26',
        sign_method: 'sha256',
        simplify: 'true',
        timestamp: '1517820392000',
      },
      'helloworld',
    )
    expect(sign).toBe('0B409A354C6FB222EE2C8095002ACDB2D30566151D1A2361AEE7D2627B9BCBEA')
  })

  it('leaves out a key whose value is empty, as the Java sample does (isNotEmpty(value))', () => {
    const base = { app_key: 'k', sign_method: 'sha256', timestamp: '1517820392000' }
    expect(buildSign('/x', { ...base, subject: '' }, 's')).toBe(buildSign('/x', base, 's'))
  })

  it('builds the system parameters around the API parameters', () => {
    const p = buildSignedParams(
      '/x',
      'k',
      's',
      'tok',
      { a: 1, b: { c: 'd' }, e: undefined },
      1517820392000,
    )
    expect(p).toMatchObject({
      app_key: 'k',
      access_token: 'tok',
      timestamp: '1517820392000',
      sign_method: 'sha256',
      a: '1',
      b: '{"c":"d"}',
    })
    expect('e' in p).toBe(false)
    const { sign, ...rest } = p
    expect(sign).toBe(buildSign('/x', rest, 's'))
  })
})

describe('alibaba authorization (docId=56)', () => {
  it('sends the seller to openapi-auth.alibaba.com with the documented parameters', () => {
    const url = new URL(buildAuthUrl('APPKEY', 'https://app.example/cb', 'st'))
    expect(url.origin + url.pathname).toBe('https://openapi-auth.alibaba.com/oauth/authorize')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      redirect_uri: 'https://app.example/cb',
      client_id: 'APPKEY',
      state: 'st',
    })
  })

  it('getAuthUrl uses the configured app key and redirect URI', () => {
    const a = new AlibabaAdapter({
      appKey: 'K',
      appSecret: 'S',
      redirectUri: 'https://r.example/cb',
    })
    expect(a.getAuthUrl('s1')).toContain('client_id=K')
  })

  it('exchanges the code through /auth/token/create on the REST gateway', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN_CREATE })
    const creds = await exchangeCode('3_500102_code', 'K', 'S')
    const [url, body] = post.mock.calls[0]!
    expect(url).toBe('https://openapi-api.alibaba.com/rest/auth/token/create')
    const sent = Object.fromEntries(new URLSearchParams(body as string))
    expect(sent).toMatchObject({ app_key: 'K', code: '3_500102_code', sign_method: 'sha256' })
    expect(sent['access_token']).toBeUndefined()
    const { sign, ...rest } = sent
    expect(sign).toBe(buildSign('/auth/token/create', rest, 'S'))
    expect(creds.accessToken).toBe(TOKEN_CREATE.access_token)
    expect(creds.refreshToken).toBe(TOKEN_CREATE.refresh_token)
    // "expires_in": "10" — seconds
    const ttl = creds.expiresAt!.getTime() - Date.now()
    expect(ttl).toBeGreaterThan(8_000)
    expect(ttl).toBeLessThanOrEqual(10_000)
    expect(creds.extra).toMatchObject({ appKey: 'K', appSecret: 'S', sellerId: '1001' })
  })

  it('throws on a non-zero gateway code', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { code: 'InvalidCode', type: 'ISV', message: 'bad code' },
    })
    await expect(exchangeCode('c', 'K', 'S')).rejects.toThrow(/InvalidCode — bad code/)
  })

  it('throws on a non-zero gateway code even when an access_token comes back', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { ...TOKEN_CREATE, code: 'IllegalRefreshToken', message: 'x' },
    })
    await expect(exchangeCode('c', 'K', 'S')).rejects.toThrow(/IllegalRefreshToken/)
  })

  it('sets no expiresAt when expires_in is absent instead of assuming a lifetime', async () => {
    const { expires_in: _omit, ...noExpiry } = TOKEN_CREATE
    vi.spyOn(axios, 'post').mockResolvedValue({ data: noExpiry })
    const creds = await exchangeCode('c', 'K', 'S')
    expect(creds.accessToken).toBe(TOKEN_CREATE.access_token)
    expect(creds.expiresAt).toBeUndefined()
  })

  it('keeps no refresh token when refresh_expires_in is 0, and then refuses to refresh', async () => {
    // docId=56: "If “refresh_expires_in” = 0, the access token cannot be refreshed."
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { ...TOKEN_CREATE, refresh_expires_in: 0 } })
    const creds = await exchangeCode('c', 'K', 'S')
    expect(creds.refreshToken).toBeUndefined()
    post.mockClear()
    await expect(refreshCredentials(creds)).rejects.toThrow(/Re-authorize/)
    expect(post).not.toHaveBeenCalled()
  })

  it('drops the refresh token when a refresh reports refresh_expires_in 0', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { ...TOKEN_CREATE, access_token: 'new-at', refresh_expires_in: '0' },
    })
    const out = await refreshCredentials({
      accessToken: 'old',
      refreshToken: 'old-rt',
      extra: { appKey: 'K', appSecret: 'S' },
    })
    expect(out.accessToken).toBe('new-at')
    expect(out.refreshToken).toBeUndefined()
  })

  it('refreshes through /auth/token/refresh with the refresh token', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { ...TOKEN_CREATE, access_token: 'new-at', refresh_token: 'new-rt' },
    })
    const out = await refreshCredentials({
      accessToken: 'old',
      refreshToken: 'old-rt',
      extra: { appKey: 'K', appSecret: 'S' },
    })
    const [url, body] = post.mock.calls[0]!
    expect(url).toBe('https://openapi-api.alibaba.com/rest/auth/token/refresh')
    expect(Object.fromEntries(new URLSearchParams(body as string))).toMatchObject({
      refresh_token: 'old-rt',
    })
    expect(out).toMatchObject({ accessToken: 'new-at', refreshToken: 'new-rt' })
  })
})
