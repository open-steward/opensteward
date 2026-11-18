/**
 * OIDC integration test — drives the real `openid-client` Auth Code + PKCE flow
 * against an in-process mock IdP (discovery + JWKS + token endpoints), with
 * RS256 ID tokens signed by `jose`. No browser/Docker; runs in CI.
 *
 * Validates: discovery, PKCE/state/nonce round-trip, ID-token signature/claim
 * validation, identity extraction (sub/email/groups), and nonce/state rejection.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import * as jose from 'jose'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore, type IdentityProviderRow } from '../../src/core/db/identity-store'
import { beginOidcLogin, completeOidcLogin } from '../../src/core/auth/idp/oidc-provider'

const CLIENT_ID = 'test-client'
const CLIENT_SECRET = 'test-client-secret'
const REDIRECT = 'http://localhost:9/redirect' // never actually navigated

interface MockIdp {
  issuer: string
  close: () => void
  /** Nonce the next issued id_token will embed (set from the auth request). */
  setNonce: (n: string) => void
  setClaims: (c: Record<string, unknown>) => void
}

async function startMockIdp(): Promise<MockIdp> {
  const { publicKey, privateKey } = await jose.generateKeyPair('RS256', { extractable: true })
  const jwk = await jose.exportJWK(publicKey)
  jwk.kid = 'test-key'
  jwk.alg = 'RS256'
  jwk.use = 'sig'

  let nonce = ''
  let claims: Record<string, unknown> = {}
  let issuer = ''

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', issuer)
    if (url.pathname === '/.well-known/openid-configuration') {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          userinfo_endpoint: `${issuer}/userinfo`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        }),
      )
      return
    }
    if (url.pathname === '/jwks') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ keys: [jwk] }))
      return
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      void (async () => {
        const idToken = await new jose.SignJWT({ nonce, ...claims })
          .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
          .setIssuer(issuer)
          .setAudience(CLIENT_ID)
          .setSubject(typeof claims.sub === 'string' ? (claims.sub as string) : 'user-1')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey)
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({ access_token: 'access-xyz', id_token: idToken, token_type: 'Bearer', expires_in: 300 }),
        )
      })()
      return
    }
    if (url.pathname === '/userinfo') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ sub: claims.sub ?? 'user-1' }))
      return
    }
    res.statusCode = 404
    res.end('not found')
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      issuer = `http://127.0.0.1:${port}`
      resolve({
        issuer,
        close: () => server.close(),
        setNonce: (n) => (nonce = n),
        setClaims: (c) => (claims = c),
      })
    })
  })
}

describe('OIDC integration (mock IdP, real openid-client)', () => {
  let idp: MockIdp
  let admin: AdminStore
  let store: IdentityStore
  let provider: IdentityProviderRow

  beforeAll(async () => {
    idp = await startMockIdp()
  })
  afterAll(() => idp.close())

  async function open() {
    const handle = await openDb({ sqlitePath: ':memory:' })
    admin = await AdminStore.create(handle)
    store = await IdentityStore.create(handle, 'test-store-secret-eeeeeeeeeeeeeeeeeeeeeeeeeeee')
    provider = await store.createProvider({
      name: 'Mock OIDC',
      slug: 'mock-oidc',
      protocol: 'oidc',
      enabled: true,
      defaultRole: 'viewer',
      config: { issuer: idp.issuer, clientId: CLIENT_ID, scopes: 'openid profile email', groupsClaim: 'groups' },
      secret: { clientSecret: CLIENT_SECRET },
    })
  }
  afterEach(async () => {
    await admin?.close()
  })

  /** Run begin → (parse nonce/state) → complete, returning the resolved identity. */
  async function runFlow(claims: Record<string, unknown>, opts: { tamperState?: boolean; tamperNonce?: boolean } = {}) {
    const authUrl = await beginOidcLogin(store, provider, CLIENT_SECRET, REDIRECT, '/')
    const parsed = new URL(authUrl)
    const state = parsed.searchParams.get('state')!
    const nonce = parsed.searchParams.get('nonce')!
    idp.setNonce(opts.tamperNonce ? 'wrong-nonce' : nonce)
    idp.setClaims(claims)
    const txn = (await store.consumeTransaction(state))!
    const callbackState = opts.tamperState ? 'bogus-state' : state
    const callbackUrl = `${REDIRECT}?code=auth-code-123&state=${callbackState}`
    return completeOidcLogin(provider, CLIENT_SECRET, callbackUrl, {
      nonce: txn.nonce,
      codeVerifier: txn.codeVerifier,
      id: txn.id,
    })
  }

  it('completes the code flow and resolves identity + groups', async () => {
    await open()
    const identity = await runFlow({
      sub: 'okta-user-1',
      email: 'jane@example.com',
      name: 'Jane Example',
      groups: ['Admins', 'Staff'],
    })
    expect(identity.externalId).toBe('okta-user-1')
    expect(identity.email).toBe('jane@example.com')
    expect(identity.displayName).toBe('Jane Example')
    expect(identity.attributes.groups).toEqual(['Admins', 'Staff'])
  })

  it('rejects a mismatched state', async () => {
    await open()
    await expect(runFlow({ sub: 'u' }, { tamperState: true })).rejects.toBeTruthy()
  })

  it('rejects a mismatched nonce', async () => {
    await open()
    await expect(runFlow({ sub: 'u' }, { tamperNonce: true })).rejects.toBeTruthy()
  })

  it('forwards configured prompt and acr_values onto the authorization request', async () => {
    await open()
    const p = await store.createProvider({
      name: 'Mock OIDC MFA',
      slug: 'mock-oidc-mfa',
      protocol: 'oidc',
      enabled: true,
      defaultRole: 'viewer',
      config: {
        issuer: idp.issuer,
        clientId: CLIENT_ID,
        scopes: 'openid profile email',
        groupsClaim: 'groups',
        prompt: 'select_account',
        acrValues: 'urn:mfa',
      },
      secret: { clientSecret: CLIENT_SECRET },
    })
    const authUrl = await beginOidcLogin(store, p, CLIENT_SECRET, REDIRECT, '/')
    const params = new URL(authUrl).searchParams
    expect(params.get('prompt')).toBe('select_account')
    expect(params.get('acr_values')).toBe('urn:mfa')
  })

  it('omits prompt/acr_values when not configured', async () => {
    await open()
    const authUrl = await beginOidcLogin(store, provider, CLIENT_SECRET, REDIRECT, '/')
    const params = new URL(authUrl).searchParams
    expect(params.get('prompt')).toBeNull()
    expect(params.get('acr_values')).toBeNull()
  })
})
