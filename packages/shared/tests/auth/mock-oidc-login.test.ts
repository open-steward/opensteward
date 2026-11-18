/**
 * The mock login issuer runs the authorization-code + PKCE flow a real IdP
 * runs when an operator signs in to the admin UI, so that flow can be
 * rehearsed end to end without Okta, Entra or Keycloak.
 *
 * Driven here the way a relying party drives it: authorize, exchange the code
 * (with PKCE and client authentication), verify the id_token against the
 * published JWKS, then read userinfo — and refused the way a real IdP refuses
 * a wrong verifier, a reused code, or a wrong client secret.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createMockIssuerKeys,
  jwksDocument,
  type MockIssuerKeys,
} from '../../src/auth/mock-oidc-issuer'
import {
  createMockOidcLogin,
  DEFAULT_PERSONAS,
  type MockOidcLogin,
} from '../../src/auth/mock-oidc-login'

let jose: typeof import('jose', { with: { 'resolution-mode': 'import' } })

const ISSUER = 'http://127.0.0.1:9400'
const CLIENT_ID = 'opensteward-admin'
const CLIENT_SECRET = 'dev-secret'
const REDIRECT = 'http://localhost:3001/api/sso/dev/callback'
const VERIFIER = 'v'.repeat(43)
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')

let keys: MockIssuerKeys
let login: MockOidcLogin

beforeAll(async () => {
  jose = await import('jose')
  keys = await createMockIssuerKeys('login-1')
  login = createMockOidcLogin({
    issuer: ISSUER,
    keys,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  })
})

function authorizeUrl(extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: 'openid profile email',
    state: 'state-1',
    nonce: 'nonce-1',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    ...extra,
  })
  return `/authorize?${q.toString()}`
}

async function authorizeAs(persona: string): Promise<string> {
  const res = await login.handle({
    method: 'GET',
    url: authorizeUrl({ login_hint: persona }),
    headers: {},
  })
  expect(res?.status).toBe(302)
  const code = new URL(res!.headers['location']!).searchParams.get('code')
  expect(code).toBeTruthy()
  return code!
}

async function exchange(code: string, overrides: Record<string, string> = {}, auth?: string) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    code_verifier: VERIFIER,
    ...overrides,
  })
  const basic = Buffer.from(`${CLIENT_ID}:${auth ?? CLIENT_SECRET}`).toString('base64')
  return login.handle({
    method: 'POST',
    url: '/token',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  })
}

describe('mock OIDC login issuer', () => {
  it('publishes the authorization-code discovery fields a relying party needs', () => {
    expect(login.discovery()).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      jwks_uri: `${ISSUER}/jwks`,
      code_challenge_methods_supported: ['S256'],
    })
    expect(login.discovery()['response_types_supported']).toContain('code')
    expect(login.discovery()['grant_types_supported']).toContain('authorization_code')
  })

  it('with a login_hint naming a persona, /authorize redirects straight back with a code and the state', async () => {
    const res = await login.handle({
      method: 'GET',
      url: authorizeUrl({ login_hint: 'alice' }),
      headers: {},
    })
    expect(res?.status).toBe(302)
    const location = new URL(res!.headers['location']!)
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT)
    expect(location.searchParams.get('state')).toBe('state-1')
    expect(location.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{20,}$/)
  })

  it('without a hint, /authorize renders a persona picker whose submit issues the code', async () => {
    const page = await login.handle({ method: 'GET', url: authorizeUrl(), headers: {} })
    expect(page?.status).toBe(200)
    expect(page?.headers['content-type']).toContain('text/html')
    for (const p of DEFAULT_PERSONAS) expect(page!.body).toContain(p.id)

    const form = new URLSearchParams({
      persona: 'bob',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      scope: 'openid',
      state: 'state-2',
      nonce: 'nonce-2',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    })
    const res = await login.handle({
      method: 'POST',
      url: '/authorize',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    expect(res?.status).toBe(302)
    expect(new URL(res!.headers['location']!).searchParams.get('state')).toBe('state-2')
  })

  it('/token exchanges the code for an id_token the JWKS verifies, carrying nonce, email and groups', async () => {
    const code = await authorizeAs('alice')
    const res = await exchange(code)
    expect(res?.status).toBe(200)
    const body = JSON.parse(res!.body) as Record<string, unknown>
    expect(body['token_type']).toBe('Bearer')
    expect(typeof body['access_token']).toBe('string')

    const { payload, protectedHeader } = await jose.jwtVerify(
      body['id_token'] as string,
      jose.createLocalJWKSet(jwksDocument(keys)),
      { issuer: ISSUER, audience: CLIENT_ID },
    )
    expect(protectedHeader.kid).toBe('login-1')
    expect(payload.sub).toBe('alice')
    expect(payload['nonce']).toBe('nonce-1')
    expect(payload['email']).toBe('alice@example.test')
    expect(payload['groups']).toEqual(['ost-admins'])
  })

  it('/token refuses a wrong PKCE verifier, and refuses a code the second time', async () => {
    const code = await authorizeAs('alice')
    const wrong = await exchange(code, { code_verifier: 'w'.repeat(43) })
    expect(wrong?.status).toBe(400)
    expect(JSON.parse(wrong!.body)['error']).toBe('invalid_grant')

    const fresh = await authorizeAs('alice')
    expect((await exchange(fresh))?.status).toBe(200)
    const again = await exchange(fresh)
    expect(again?.status).toBe(400)
    expect(JSON.parse(again!.body)['error']).toBe('invalid_grant')
  })

  it('/token refuses a wrong client secret', async () => {
    const code = await authorizeAs('alice')
    const res = await exchange(code, {}, 'not-the-secret')
    expect(res?.status).toBe(401)
    expect(JSON.parse(res!.body)['error']).toBe('invalid_client')
  })

  it('/userinfo answers the access token with the persona, and refuses without one', async () => {
    const code = await authorizeAs('carol')
    const token = JSON.parse((await exchange(code))!.body)['access_token'] as string
    const res = await login.handle({
      method: 'GET',
      url: '/userinfo',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res?.status).toBe(200)
    expect(JSON.parse(res!.body)).toMatchObject({
      sub: 'carol',
      email: 'carol@example.test',
      groups: [],
    })

    const anon = await login.handle({ method: 'GET', url: '/userinfo', headers: {} })
    expect(anon?.status).toBe(401)
  })

  it('leaves paths it does not own to the caller', async () => {
    expect(await login.handle({ method: 'GET', url: '/jwks', headers: {} })).toBeNull()
    expect(
      await login.handle({ method: 'GET', url: '/.well-known/openid-configuration', headers: {} }),
    ).toBeNull()
  })
})
