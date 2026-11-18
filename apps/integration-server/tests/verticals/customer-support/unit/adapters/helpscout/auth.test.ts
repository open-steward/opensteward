/**
 * Help Scout OAuth, per
 * https://developer.helpscout.com/mailbox-api/overview/authentication/
 * (fetched 2026-09-28): authorize at
 * secure.helpscout.net/authentication/authorizeClientApplication with
 * client_id and state; exchange and refresh by form POST to
 * api.helpscout.net/v2/oauth2/token with client_id and client_secret in the
 * body. No scopes and no redirect_uri are documented anywhere in the flow.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { HelpScoutAdapter } from '../../../../../../src/verticals/customer-support/adapters/helpscout/index'

const CFG = {
  clientId: 'hs-app-id',
  clientSecret: 'hs-app-secret',
  redirectUri: 'http://localhost:3010/auth/customer-support/helpscout/callback',
}
const TOKEN_URL = 'https://api.helpscout.net/v2/oauth2/token'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockTokenPost(data: Record<string, unknown>) {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data } as never)
}

function formOf(body: unknown): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(String(body)))
}

describe('helpscout getAuthUrl', () => {
  it('sends client_id and state to the documented authorize URL, and nothing else', () => {
    const url = new URL(new HelpScoutAdapter(CFG).getAuthUrl('st-1'))
    expect(url.origin + url.pathname).toBe(
      'https://secure.helpscout.net/authentication/authorizeClientApplication',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: 'hs-app-id', state: 'st-1' })
  })

  it('emits no scope param, overridden or not: Help Scout documents none', () => {
    const url = new HelpScoutAdapter(CFG).getAuthUrl('st-1', ['read-only-marker'])
    expect(url).not.toMatch(/[?&]scope=/)
    expect(url).not.toContain('read-only-marker')
  })
})

describe('helpscout exchangeCode', () => {
  it('POSTs the documented form to the token URL with the client secret in the body', async () => {
    const post = mockTokenPost({
      refresh_token: 'c01194f69c3e4307a4fd0e9403fc8fd0',
      token_type: 'bearer',
      access_token: '8fccb4f5cf6746148f336414f798cd87',
      expires_in: 172800,
    })
    const before = Date.now()
    const creds = await new HelpScoutAdapter(CFG).exchangeCode('the-code', CFG.redirectUri)

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, cfg] = post.mock.calls[0]!
    expect(url).toBe(TOKEN_URL)
    expect(formOf(body)).toEqual({
      code: 'the-code',
      client_id: 'hs-app-id',
      client_secret: 'hs-app-secret',
      grant_type: 'authorization_code',
    })
    expect((cfg as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    // Client auth is in the body, not HTTP Basic.
    expect((cfg as { auth?: unknown }).auth).toBeUndefined()

    expect(creds.accessToken).toBe('8fccb4f5cf6746148f336414f798cd87')
    expect(creds.refreshToken).toBe('c01194f69c3e4307a4fd0e9403fc8fd0')
    const expires = creds.expiresAt!.getTime()
    expect(expires).toBeGreaterThanOrEqual(before + 172800 * 1000)
    expect(expires).toBeLessThanOrEqual(Date.now() + 172800 * 1000)
  })

  it('refuses a token response without an access token', async () => {
    mockTokenPost({ token_type: 'bearer' })
    await expect(new HelpScoutAdapter(CFG).exchangeCode('c', CFG.redirectUri)).rejects.toThrow(
      /no access_token/,
    )
  })
})

describe('helpscout refreshCredentials', () => {
  it('POSTs grant_type=refresh_token and takes the new rotated pair', async () => {
    const post = mockTokenPost({
      refresh_token: '8fccb4f5cf6746148f336414f798cd87',
      token_type: 'bearer',
      access_token: '8fccb99232cf6743148f336414f798cd87',
      expires_in: 172800,
    })
    const out = await new HelpScoutAdapter(CFG).refreshCredentials({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      extra: { kept: 'yes' },
    })
    const [url, body] = post.mock.calls[0]!
    expect(url).toBe(TOKEN_URL)
    expect(formOf(body)).toEqual({
      refresh_token: 'old-refresh',
      client_id: 'hs-app-id',
      client_secret: 'hs-app-secret',
      grant_type: 'refresh_token',
    })
    expect(out.accessToken).toBe('8fccb99232cf6743148f336414f798cd87')
    expect(out.refreshToken).toBe('8fccb4f5cf6746148f336414f798cd87')
    expect(out.expiresAt).toBeInstanceOf(Date)
    expect(out.extra).toEqual({ kept: 'yes' })
  })

  it('throws before any request when the connection holds no refresh token', async () => {
    const post = mockTokenPost({})
    await expect(
      new HelpScoutAdapter(CFG).refreshCredentials({ accessToken: 'a' }),
    ).rejects.toThrow(/no refresh token/)
    expect(post).not.toHaveBeenCalled()
  })
})
