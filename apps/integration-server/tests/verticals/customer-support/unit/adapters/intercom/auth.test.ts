/**
 * Intercom OAuth, per "Setting up OAuth" (fetched 2026-09-28):
 * https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/setting-up-oauth
 *
 * - authorize on the region's host with `client_id` and `state` (and
 *   `redirect_uri`); no scope parameter exists;
 * - exchange: POST https://api.intercom.io/auth/eagle/token with `code`,
 *   `client_id`, `client_secret` in a form body (Net::HTTP.post_form);
 * - response `{ token_type, token, access_token }`: no refresh token, no expiry.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { IntercomAdapter } from '../../../../../../src/verticals/customer-support/adapters/intercom/index'
import { normaliseRegion } from '../../../../../../src/verticals/customer-support/adapters/intercom/auth'

const CFG = {
  clientId: 'ic-client',
  clientSecret: 'ic-secret',
  redirectUri: 'https://connect.example.test/auth/customer-support/intercom/callback',
}

afterEach(() => vi.restoreAllMocks())

describe('normaliseRegion', () => {
  it.each([
    ['us', 'us'],
    [' EU ', 'eu'],
    ['Au', 'au'],
  ])('%s → %s', (input, want) => {
    expect(normaliseRegion(input)).toBe(want)
  })

  it('refuses a blank or unknown region with a message naming it', () => {
    expect(() => normaliseRegion('')).toThrow(/Intercom region is required/)
    expect(() => normaliseRegion(undefined)).toThrow(/Intercom region is required/)
    expect(() => normaliseRegion('ca')).toThrow(/must be one of us, eu or au/)
  })
})

describe('IntercomAdapter authorize URL', () => {
  const adapter = new IntercomAdapter(CFG)

  it('declares the region as a required select oauthField', () => {
    const fields = adapter.oauthFields()
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ name: 'region', type: 'select', required: true })
    expect(fields[0]?.options?.map((o) => o.value)).toEqual(['us', 'eu', 'au'])
  })

  it.each([
    ['us', 'app.intercom.com'],
    ['eu', 'app.eu.intercom.com'],
    ['au', 'app.au.intercom.com'],
  ])('region %s authorizes on %s/oauth', (region, host) => {
    const u = new URL(adapter.getAuthUrl('st-1', undefined, undefined, { region }))
    expect(u.protocol).toBe('https:')
    expect(u.host).toBe(host)
    expect(u.pathname).toBe('/oauth')
    expect(u.searchParams.get('client_id')).toBe('ic-client')
    expect(u.searchParams.get('state')).toBe('st-1')
    expect(u.searchParams.get('redirect_uri')).toBe(CFG.redirectUri)
  })

  it('sends no scope parameter, with or without overrideScopes (scopes live on the app)', () => {
    const plain = adapter.getAuthUrl('s', undefined, undefined, { region: 'us' })
    const overridden = adapter.getAuthUrl('s', ['override-marker'], undefined, { region: 'us' })
    expect(plain).not.toMatch(/[?&]scope=/)
    expect(overridden).not.toMatch(/[?&]scope=/)
    expect(overridden).not.toContain('override-marker')
  })

  it('refuses to build a URL without a region', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(/Intercom region is required/)
  })
})

describe('IntercomAdapter token exchange', () => {
  const adapter = new IntercomAdapter(CFG)

  it('POSTs a form body with code, client_id and client_secret to the eagle token URL', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { token_type: 'Bearer', token: 'tok-1', access_token: 'tok-1' },
    })
    const creds = await adapter.exchangeCodeWithInputs('code=', CFG.redirectUri, { region: 'EU' })

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://api.intercom.io/auth/eagle/token')
    expect(typeof body).toBe('string')
    const form = new URLSearchParams(body as string)
    expect(Object.fromEntries(form)).toEqual({
      code: 'code=',
      client_id: 'ic-client',
      client_secret: 'ic-secret',
    })
    const headers = (config?.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    // Client authentication is the body's client_secret, not HTTP Basic.
    expect(headers['Authorization']).toBeUndefined()
    expect(config?.auth).toBeUndefined()

    expect(creds).toEqual({ accessToken: 'tok-1', extra: { region: 'eu' } })
    expect(creds.refreshToken).toBeUndefined()
    expect(creds.expiresAt).toBeUndefined()
  })

  it('falls back to `token` when `access_token` is absent', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { token_type: 'Bearer', token: 'tok-2' } })
    const creds = await adapter.exchangeCodeWithInputs('c', CFG.redirectUri, { region: 'au' })
    expect(creds.accessToken).toBe('tok-2')
    expect(creds.extra).toEqual({ region: 'au' })
  })

  it('throws when the response carries no token', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { token_type: 'Bearer' } })
    await expect(
      adapter.exchangeCodeWithInputs('c', CFG.redirectUri, { region: 'us' }),
    ).rejects.toThrow(/no access token/)
  })

  it('refuses an unknown region before spending the code', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCodeWithInputs('c', CFG.redirectUri, { region: 'mars' }),
    ).rejects.toThrow(/must be one of us, eu or au/)
    expect(post).not.toHaveBeenCalled()
  })

  it('plain exchangeCode (no region collected) throws before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(adapter.exchangeCode('c', CFG.redirectUri)).rejects.toThrow(
      /Intercom region is required/,
    )
    expect(post).not.toHaveBeenCalled()
  })
})

describe('IntercomAdapter refresh', () => {
  it('returns the credentials unchanged and sends nothing: Intercom issues no refresh token or expiry', async () => {
    const post = vi.spyOn(axios, 'post')
    const get = vi.spyOn(axios, 'get')
    const creds = { accessToken: 'tok', extra: { region: 'us' } }
    const out = await new IntercomAdapter(CFG).refreshCredentials(creds)
    expect(out).toEqual({ accessToken: 'tok', extra: { region: 'us' } })
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})
