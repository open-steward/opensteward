/**
 * BASE OAuth2 — authorization-code + refresh_token grant, one
 * deployment-wide app.
 * Docs: https://docs.thebase.in/api/oauth/authorize , https://docs.thebase.in/api/
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  buildAuthUrl,
  exchangeCode,
  refreshCredentials,
} from '../../../../../../src/verticals/ecommerce/adapters/base-ec/auth'

afterEach(() => vi.restoreAllMocks())

describe('buildAuthUrl (BASE)', () => {
  it('builds the authorize URL with response_type=code and space-separated scopes', () => {
    const url = buildAuthUrl('cid', 'https://app.example/callback', ['read_items', 'read_orders'], 'st4te')
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://api.thebase.in/1/oauth/authorize')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe('cid')
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example/callback')
    expect(parsed.searchParams.get('scope')).toBe('read_items read_orders')
    expect(parsed.searchParams.get('state')).toBe('st4te')
  })
})

describe('exchangeCode (BASE)', () => {
  it('POSTs the authorization_code grant to the token endpoint', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'read_items' },
    })
    const creds = await exchangeCode('the-code', 'cid', 'secret', 'https://app.example/callback')
    expect(post).toHaveBeenCalledWith(
      'https://api.thebase.in/1/oauth/token',
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      }),
    )
    const body = new URLSearchParams(post.mock.calls[0]![1] as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_id')).toBe('cid')
    expect(body.get('client_secret')).toBe('secret')
    expect(body.get('code')).toBe('the-code')
    expect(body.get('redirect_uri')).toBe('https://app.example/callback')
    expect(creds.accessToken).toBe('at')
    expect(creds.refreshToken).toBe('rt')
    expect(creds.scope).toBe('read_items')
    expect(creds.expiresAt).toBeInstanceOf(Date)
  })

  it('throws when the token endpoint returns no access_token', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
    await expect(exchangeCode('c', 'cid', 'sec', 'https://x/callback')).rejects.toThrow(
      /empty access_token/,
    )
  })
})

describe('refreshCredentials (BASE)', () => {
  it('POSTs the refresh_token grant and keeps the old refresh token if none is returned', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'new-at', expires_in: 3600 },
    })
    const result = await refreshCredentials({ accessToken: 'old-at', refreshToken: 'old-rt' }, 'cid', 'secret')
    const body = new URLSearchParams(post.mock.calls[0]![1] as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('old-rt')
    expect(result.accessToken).toBe('new-at')
    expect(result.refreshToken).toBe('old-rt')
  })

  it('throws without a stored refresh token', async () => {
    await expect(refreshCredentials({ accessToken: 'at' }, 'cid', 'secret')).rejects.toThrow(
      /requires a refreshToken/,
    )
  })
})
