/**
 * Journey: a developer authenticates with a token from their company's IdP.
 *
 * The persona is an engineer at a company whose service accounts already live
 * in Keycloak or Entra ID, integrating against a self-hosted OpenSteward. They
 * never get a static `osk_` key; they get a token the way they get one for
 * every other internal service, and it works on the same routes.
 *
 * Boots the real server via buildTestServer and drives it with inject, so what
 * is asserted is the wiring — that the token reaches the same scope engine, the
 * same 403s, and the same tenant scoping a key does. A local HTTP server stands
 * in for the IdP's JWKS endpoint; no network.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { resetJwksCache } from '@opensteward/shared'

// jose is ESM-only and this project typechecks as CommonJS, so a static
// import fails tsc; the dynamic form loads it before any hook uses it.
let jose: typeof import('jose', { with: { 'resolution-mode': 'import' } })
beforeAll(async () => {
  jose = await import('jose')
})

const AUDIENCE = 'https://opensteward.journeys.test'

let server: TestServer
let idp: Server
let issuerUrl: string
let jwksUri: string
let signingKey: CryptoKey
let publicJwk: Record<string, unknown>
let savedEnv: Record<string, string | undefined>

function setEnv(values: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

beforeEach(async () => {
  savedEnv = {
    OST_ALLOW_PRIVATE_HOSTS: process.env['OST_ALLOW_PRIVATE_HOSTS'],
    AUTH_DEV_OAUTH_ENABLED: process.env['AUTH_DEV_OAUTH_ENABLED'],
    AUTH_DEV_API_KEYS_ENABLED: process.env['AUTH_DEV_API_KEYS_ENABLED'],
  }
  // A Keycloak container on localhost is exactly the shape this allows.
  setEnv({ OST_ALLOW_PRIVATE_HOSTS: '1', AUTH_DEV_OAUTH_ENABLED: '1' })
  resetJwksCache()

  const pair = await jose.generateKeyPair('RS256', { extractable: true })
  signingKey = pair.privateKey
  publicJwk = { ...(await jose.exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }

  idp = createServer((req, res) => {
    if (req.url === '/jwks') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ keys: [publicJwk] }))
      return
    }
    res.statusCode = 404
    res.end('no')
  })
  await new Promise<void>((resolve) => idp.listen(0, '127.0.0.1', resolve))
  issuerUrl = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`
  jwksUri = `${issuerUrl}/jwks`
})

afterEach(async () => {
  await server?.cleanup()
  await new Promise<void>((resolve) => idp.close(() => resolve()))
  setEnv(savedEnv)
})

async function token(scope = 'customers:read', subject = 'billing-service'): Promise<string> {
  return new jose.SignJWT({ azp: subject, scope })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setIssuer(issuerUrl)
    .setAudience(AUDIENCE)
    .setExpirationTime('5m')
    .sign(signingKey)
}

/** The operator's side: register the IdP and the developer's service account. */
async function registerIdp(scopes: string[]): Promise<{ issuerId: string; clientId: string }> {
  const issuer = await server.oauthClients.createIssuer({
    name: 'Corp Keycloak',
    preset: 'keycloak',
    issuer: issuerUrl,
    jwksUri,
    audience: AUDIENCE,
    subjectClaim: 'azp',
    scopeClaim: 'scope',
  })
  const client = await server.oauthClients.createClient({
    issuerId: issuer.id,
    subject: 'billing-service',
    tenantId: 'acme',
    scopes,
  })
  return { issuerId: issuer.id, clientId: client.id }
}

const get = (url: string, jwt: string) =>
  server.fastify.inject({ method: 'GET', url, headers: { authorization: `Bearer ${jwt}` } })

describe('Journey: a developer calls the API with a token from their own IdP', () => {
  beforeEach(async () => {
    server = await buildTestServer()
  })

  it('reads their tenant with a token, having never been given a key', async () => {
    await registerIdp(['customers:read'])
    const res = await get('/v1/customers', await token())
    expect(res.statusCode).toBe(200)
  })

  it('is refused a write, by the same scope engine that governs a key', async () => {
    // The whole reason the token maps onto the existing scope vocabulary: a
    // route demanding `customers:write` demands it identically here.
    await registerIdp(['customers:read'])
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${await token()}` },
      payload: { email: 'someone@acme.example' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('INSUFFICIENT_SCOPE')
  })

  it('is allowed the write once the operator grants the scope', async () => {
    await registerIdp(['customers:read', 'customers:write'])
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${await token()}` },
      payload: { email: 'someone@acme.example' },
    })
    expect(res.statusCode).toBeLessThan(300)
  })

  it('is refused when the operator never registered their service account', async () => {
    await registerIdp(['customers:read'])
    const res = await get('/v1/customers', await token('customers:read', 'somebody-else'))
    expect(res.statusCode).toBe(401)
    // Uniform body: nothing here reveals that the issuer was recognised.
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('loses access the moment the operator revokes them, mid-token', async () => {
    const { clientId } = await registerIdp(['customers:read'])
    const jwt = await token()
    expect((await get('/v1/customers', jwt)).statusCode).toBe(200)

    await server.oauthClients.revokeClient(clientId)

    // Same token, still signed, still unexpired. This is the property a
    // registry-mode deployment is buying.
    expect((await get('/v1/customers', jwt)).statusCode).toBe(401)
  })
})

describe('Journey: an operator retires static API keys', () => {
  it('reports OAuth as unready until a real token has verified', async () => {
    server = await buildTestServer()
    // admin-api asks this before it will let the operator switch keys off.
    const before = await server.fastify.inject({ method: 'GET', url: '/admin/oauth/readiness' })
    expect(before.json().data.ready).toBe(false)
    expect(before.json().data.reason).toContain('No OIDC issuer')

    await registerIdp(['customers:read'])
    const staged = await server.fastify.inject({ method: 'GET', url: '/admin/oauth/readiness' })
    // Registered, but nobody has proved it works yet.
    expect(staged.json().data.ready).toBe(false)
    expect(staged.json().data.reason).toContain('never verified')

    expect((await get('/v1/customers', await token())).statusCode).toBe(200)

    const after = await server.fastify.inject({ method: 'GET', url: '/admin/oauth/readiness' })
    expect(after.json().data.ready).toBe(true)
  })

  it('turns keys off without disturbing the tokens', async () => {
    setEnv({ AUTH_DEV_API_KEYS_ENABLED: '0' })
    server = await buildTestServer()
    await registerIdp(['customers:read'])

    const key = await server.fastify.inject({
      method: 'POST',
      url: '/admin/api-keys',
      payload: { tenantId: 'acme', scopes: ['customers:read'] },
    })
    expect(key.statusCode).toBeLessThan(300)
    const plaintext = key.json().data?.key ?? key.json().key

    const refused = await get('/v1/customers', plaintext)
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error.code).toBe('API_KEYS_DISABLED')

    // The credential the operator moved to still works.
    expect((await get('/v1/customers', await token())).statusCode).toBe(200)
  })
})
