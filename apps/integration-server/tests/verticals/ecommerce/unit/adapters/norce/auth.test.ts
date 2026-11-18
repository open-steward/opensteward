/**
 * Norce auth — host building, token minting/caching, and refresh.
 * Docs: https://docs.norce.io/api-reference/accessing-apis-with-oauth2-accounts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  buildHost,
  tokenUrl,
  queryBaseUrl,
  fetchToken,
  refreshCredentials,
  exchangeCode,
} from '../../../../../../src/verticals/ecommerce/adapters/norce/auth'

describe('Norce buildHost', () => {
  it('omits the environment segment for prod', () => {
    expect(buildHost('acme', 'se', 'prod')).toBe('acme.api-se.norce.tech')
  })

  it('includes the environment segment for stage/playground', () => {
    expect(buildHost('acme', 'se', 'stage')).toBe('acme.api-se.stage.norce.tech')
    expect(buildHost('acme', 'se', 'playground')).toBe('acme.api-se.playground.norce.tech')
  })

  it('every host it can produce ends in .norce.tech', () => {
    for (const env of ['prod', 'stage', 'playground']) {
      expect(buildHost('acme', 'se', env)).toMatch(/\.norce\.tech$/)
    }
  })
})

describe('Norce tokenUrl / queryBaseUrl', () => {
  it('point at the identity and query paths on the given host', () => {
    expect(tokenUrl('acme.api-se.norce.tech')).toBe(
      'https://acme.api-se.norce.tech/identity/1.0/connect/token',
    )
    expect(queryBaseUrl('acme.api-se.norce.tech')).toBe(
      'https://acme.api-se.norce.tech/commerce/query/2.0',
    )
  })
})

describe('Norce fetchToken', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends a client_credentials grant with scope=environment', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } })

    await fetchToken('acme.api-se.norce.tech', 'cid', 'csecret', 'stage')

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://acme.api-se.norce.tech/identity/1.0/connect/token')
    const params = new URLSearchParams(body as string)
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('client_id')).toBe('cid')
    expect(params.get('client_secret')).toBe('csecret')
    expect(params.get('scope')).toBe('stage')
    expect((config as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
  })

  it('caches for expires_in minus a safety skew, not the raw value', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', expires_in: 3600 },
    })
    const before = Date.now()
    const { expiresAt } = await fetchToken('h', 'cid', 'sec', 'prod')
    const seconds = (expiresAt.getTime() - before) / 1000
    expect(seconds).toBeGreaterThan(3500)
    expect(seconds).toBeLessThan(3600)
  })

  it('falls back to a fixed lifetime when expires_in is absent', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok' } })
    const before = Date.now()
    const { expiresAt } = await fetchToken('h', 'cid', 'sec', 'prod')
    expect(expiresAt.getTime()).toBeGreaterThan(before)
  })

  it('throws when the token endpoint returns no access_token', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
    await expect(fetchToken('h', 'cid', 'sec', 'prod')).rejects.toThrow(
      /empty access_token/,
    )
  })
})

describe('Norce refreshCredentials', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('re-mints a token using the fields stashed at connect time', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok_2', expires_in: 3600 } })

    const creds = await refreshCredentials({
      accessToken: 'tok_1',
      extra: {
        host: 'acme.api-se.norce.tech',
        environment: 'prod',
        clientId: 'cid',
        clientSecret: 'sec',
        applicationId: '1000',
      },
    })

    expect(post).toHaveBeenCalledWith(
      'https://acme.api-se.norce.tech/identity/1.0/connect/token',
      expect.any(String),
      expect.anything(),
    )
    expect(creds.accessToken).toBe('tok_2')
    // Non-auth fields (applicationId) survive the refresh untouched.
    expect(creds.extra?.['applicationId']).toBe('1000')
  })

  it('throws a descriptive error when required extra fields are missing', async () => {
    await expect(refreshCredentials({ accessToken: 'x', extra: {} })).rejects.toThrow(
      /requires host, environment, clientId, and clientSecret/,
    )
  })
})

describe('Norce exchangeCode', () => {
  it('throws — Norce has no authorization-code flow', () => {
    expect(() => exchangeCode()).toThrow(/client-credentials only/)
  })
})
