/**
 * Optimizely auth — token minting via the resource-owner password grant,
 * caching, and refresh. Docs:
 * https://docs.developers.optimizely.com/configured-commerce/reference/getting-started-with-the-b2b-commerce-rest-apis
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  tokenUrl,
  fetchToken,
  refreshCredentials,
  exchangeCode,
} from '../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/auth'
import {
  STOREFRONT_CLIENT_ID,
  STOREFRONT_CLIENT_SECRET,
} from '../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/constants'

describe('Optimizely tokenUrl', () => {
  it('appends the identity token path to the instance, stripping a trailing slash', () => {
    expect(tokenUrl('https://mystore.insitesandbox.com')).toBe(
      'https://mystore.insitesandbox.com/identity/connect/token',
    )
    expect(tokenUrl('https://mystore.insitesandbox.com/')).toBe(
      'https://mystore.insitesandbox.com/identity/connect/token',
    )
  })
})

describe('Optimizely fetchToken', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('authenticates the public storefront client via HTTP Basic and sends a password grant', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } })

    await fetchToken('https://mystore.insitesandbox.com', 'api-user', 'hunter2')

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://mystore.insitesandbox.com/identity/connect/token')
    const params = new URLSearchParams(body as string)
    expect(params.get('grant_type')).toBe('password')
    expect(params.get('username')).toBe('api-user')
    expect(params.get('password')).toBe('hunter2')
    expect(params.get('scope')).toBe('iscapi')
    const expectedAuth = `Basic ${Buffer.from(`${STOREFRONT_CLIENT_ID}:${STOREFRONT_CLIENT_SECRET}`).toString('base64')}`
    expect((config as { headers: Record<string, string> }).headers['Authorization']).toBe(
      expectedAuth,
    )
  })

  it('caches for expires_in minus a safety skew', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } })
    const before = Date.now()
    const { expiresAt } = await fetchToken('h', 'u', 'p')
    const seconds = (expiresAt.getTime() - before) / 1000
    expect(seconds).toBeGreaterThan(3500)
    expect(seconds).toBeLessThan(3600)
  })

  it('falls back to a fixed lifetime when expires_in is absent', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok' } })
    const before = Date.now()
    const { expiresAt } = await fetchToken('h', 'u', 'p')
    expect(expiresAt.getTime()).toBeGreaterThan(before)
  })

  it('throws when the token endpoint returns no access_token', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
    await expect(fetchToken('h', 'u', 'p')).rejects.toThrow(/empty access_token/)
  })
})

describe('Optimizely refreshCredentials', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('re-runs the password grant using the username/password stashed at connect time', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok_2', expires_in: 3600 } })

    const creds = await refreshCredentials({
      accessToken: 'tok_1',
      extra: { instance: 'https://mystore.insitesandbox.com', username: 'api-user', password: 'hunter2' },
    })

    expect(post).toHaveBeenCalledWith(
      'https://mystore.insitesandbox.com/identity/connect/token',
      expect.any(String),
      expect.anything(),
    )
    expect(creds.accessToken).toBe('tok_2')
    expect(creds.extra?.['username']).toBe('api-user')
  })

  it('throws a descriptive error when required extra fields are missing', async () => {
    await expect(refreshCredentials({ accessToken: 'x', extra: {} })).rejects.toThrow(
      /requires instance, username, and password/,
    )
  })
})

describe('Optimizely exchangeCode', () => {
  it('throws — Optimizely has no authorization-code flow', () => {
    expect(() => exchangeCode()).toThrow(/resource-owner password grant/)
  })
})
