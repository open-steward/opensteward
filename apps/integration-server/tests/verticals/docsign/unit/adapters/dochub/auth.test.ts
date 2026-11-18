/**
 * DocHub OAuth, against what DocHub documents:
 *
 * - https://dochub.com/.well-known/oauth-authorization-server (RFC 8414):
 *   `"authorization_endpoint":"https://dochub.com/oauth/authorize"`,
 *   `"token_endpoint":"https://dochub.com/api/v2/oauth/token"`,
 *   `"code_challenge_methods_supported":["S256"]`,
 *   `"token_endpoint_auth_methods_supported":["none","client_secret_basic","client_secret_post"]`,
 *   and `scopes_supported` listing `sign_requests:read`, `sign_requests:write`.
 * - https://dev.dochub.com/api-reference/openapi.yaml, operationId
 *   createOAuthToken on POST /api/v2/oauth/token: "`authorization_code` -
 *   Exchange authorization code for access token (with PKCE)", `security:
 *   - basicAuth: []` ("`Authorization: Basic base64(client_id:client_secret)`"),
 *   body fields `grant_type`, `code`, `redirect_uri`, `code_verifier` /
 *   `grant_type`, `refresh_token`, and the flat `application/json` response
 *   `access_token`, `token_type`, `expires_in`, `refresh_token`, `scope`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DochubAdapter } from '../../../../../../src/verticals/docsign/adapters/dochub'

const adapter = new DochubAdapter({
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://app.example/auth/docsign/dochub/callback',
})

const BASIC = `Basic ${Buffer.from('cid:sec').toString('base64')}`

interface Post {
  url: string
  body: URLSearchParams
  headers: Record<string, unknown>
}

function fakeTokenEndpoint(response: Record<string, unknown>) {
  const posts: Post[] = []
  vi.spyOn(axios, 'post').mockImplementation((async (
    url: string,
    body: unknown,
    cfg?: { headers?: Record<string, unknown> },
  ) => {
    posts.push({ url, body: new URLSearchParams(String(body)), headers: cfg?.headers ?? {} })
    return { data: response }
  }) as unknown as typeof axios.post)
  return posts
}

afterEach(() => vi.restoreAllMocks())

// Documented example "Authorization code grant token" of createOAuthToken.
const TOKEN = {
  access_token: 'T21L8x9PqR3vW5yZ...',
  token_type: 'Bearer',
  expires_in: 7200,
  refresh_token: 'GTiAaqCqPZ6eJnEXxE9TGEA3QlG8JFw0K061xldJACI',
  scope: 'documents:read account:read',
  created_at: 1732694400,
}

describe('DocHub authorize URL', () => {
  it('declares requiresPkce so the connect flow mints a challenge', () => {
    expect(adapter.capabilities.requiresPkce).toBe(true)
  })

  it('points at the discovery document’s authorization_endpoint', () => {
    const url = new URL(adapter.getAuthUrl('st', undefined, 'CHAL'))
    expect(`${url.origin}${url.pathname}`).toBe('https://dochub.com/oauth/authorize')
  })

  it('sends an S256 challenge, code response, client, redirect and state', () => {
    const p = new URL(adapter.getAuthUrl('st-1', undefined, 'CHAL')).searchParams
    expect(p.get('response_type')).toBe('code')
    expect(p.get('client_id')).toBe('cid')
    expect(p.get('redirect_uri')).toBe('https://app.example/auth/docsign/dochub/callback')
    expect(p.get('state')).toBe('st-1')
    expect(p.get('code_challenge')).toBe('CHAL')
    expect(p.get('code_challenge_method')).toBe('S256')
  })

  it('requests documented scopes, space-delimited, in resource:action form', () => {
    const p = new URL(adapter.getAuthUrl('st', undefined, 'CHAL')).searchParams
    expect(p.get('scope')).toBe('sign_requests:read sign_requests:write')
  })

  it('sends no PKCE parameters when the connect flow supplies no challenge', () => {
    const p = new URL(adapter.getAuthUrl('st')).searchParams
    expect(p.has('code_challenge')).toBe(false)
    expect(p.has('code_challenge_method')).toBe(false)
  })

  it('uses override scopes when the connect link supplies them', () => {
    const p = new URL(adapter.getAuthUrl('st', ['sign_requests:read'], 'CHAL')).searchParams
    expect(p.get('scope')).toBe('sign_requests:read')
  })
})

describe('DocHub token exchange', () => {
  it('posts the code and verifier to /api/v2/oauth/token with client Basic auth', async () => {
    const posts = fakeTokenEndpoint(TOKEN)
    await adapter.exchangeCodeWithVerifier('xyz789abc123', 'https://myapp.com/callback', 'VER')
    expect(posts).toHaveLength(1)
    const post = posts[0]!
    expect(post.url).toBe('https://dochub.com/api/v2/oauth/token')
    expect(post.headers.Authorization).toBe(BASIC)
    expect(post.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(post.headers.Accept).toBe('application/json')
    expect(Object.fromEntries(post.body)).toEqual({
      grant_type: 'authorization_code',
      code: 'xyz789abc123',
      redirect_uri: 'https://myapp.com/callback',
      code_verifier: 'VER',
    })
  })

  it('maps the flat token response onto credentials', async () => {
    fakeTokenEndpoint(TOKEN)
    const before = Date.now()
    const creds = await adapter.exchangeCodeWithVerifier('c', 'https://x/cb', 'VER')
    expect(creds.accessToken).toBe(TOKEN.access_token)
    expect(creds.refreshToken).toBe(TOKEN.refresh_token)
    expect(creds.scope).toBe(TOKEN.scope)
    const ttl = creds.expiresAt!.getTime() - before
    expect(ttl).toBeGreaterThanOrEqual(7200 * 1000 - 50)
    expect(ttl).toBeLessThanOrEqual(7200 * 1000 + 1000)
  })

  it('exchangeCode without a verifier sends no code_verifier', async () => {
    const posts = fakeTokenEndpoint(TOKEN)
    await adapter.exchangeCode('c', 'https://x/cb')
    expect(posts[0]!.url).toBe('https://dochub.com/api/v2/oauth/token')
    expect(posts[0]!.headers.Authorization).toBe(BASIC)
    expect(posts[0]!.body.has('code_verifier')).toBe(false)
  })

  it('refreshes at the same endpoint with Basic auth and keeps an unrotated refresh token', async () => {
    const { refresh_token: _omit, ...noRefresh } = TOKEN
    const posts = fakeTokenEndpoint({ ...noRefresh, access_token: 'new' })
    const old: Credentials = {
      accessToken: 'old',
      refreshToken: 'r1',
      scope: 'sign_requests:read',
      extra: {},
    }
    const creds = await adapter.refreshCredentials(old)
    expect(posts[0]!.url).toBe('https://dochub.com/api/v2/oauth/token')
    expect(posts[0]!.headers.Authorization).toBe(BASIC)
    expect(Object.fromEntries(posts[0]!.body)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
    })
    expect(creds.accessToken).toBe('new')
    expect(creds.refreshToken).toBe('r1')
  })

  it('takes the refreshed expiry and granted scope from the response', async () => {
    fakeTokenEndpoint({
      ...TOKEN,
      access_token: 'new',
      expires_in: 3600,
      scope: 'sign_requests:read',
    })
    const before = Date.now()
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'r1',
      expiresAt: new Date(0),
      scope: 'sign_requests:read sign_requests:write',
      extra: {},
    })
    const ttl = creds.expiresAt!.getTime() - before
    expect(ttl).toBeGreaterThanOrEqual(3600 * 1000 - 50)
    expect(ttl).toBeLessThanOrEqual(3600 * 1000 + 1000)
    expect(creds.scope).toBe('sign_requests:read')
  })

  it('keeps the stored scope when the refresh response omits it', async () => {
    const { scope: _omit, ...noScope } = TOKEN
    fakeTokenEndpoint({ ...noScope, access_token: 'new' })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      refreshToken: 'r1',
      scope: 'sign_requests:read',
      extra: {},
    })
    expect(creds.scope).toBe('sign_requests:read')
  })

  it('rejects a token response without access_token (a required field)', async () => {
    const { access_token: _omit, ...noAccess } = TOKEN
    fakeTokenEndpoint(noAccess)
    await expect(adapter.exchangeCodeWithVerifier('c', 'https://x/cb', 'VER')).rejects.toThrow(
      /no access_token/,
    )
  })
})
