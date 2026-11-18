/**
 * `auth.dev_api_keys_enabled` and `auth.dev_oauth_enabled` — which developer
 * credential a deployment accepts.
 *
 * Both are read per request, not once at boot, so an operator's flip in the
 * admin UI lands on the next settings poll rather than needing a redeploy.
 * Each test drives them through mutable flags to prove that read really is
 * per-request — the same harness shape as `mcp-kill-switch.test.ts`, and for
 * the same reason: a setting nothing reads is a setting that lies.
 *
 * The case worth reading twice is the last one. With both credentials switched
 * off, `X-Admin-Secret` still works. That is the deployment's way back in, and
 * it is why turning API keys off is survivable at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { OAuthClientStore } from '../../src/auth/oauth-clients'
import { createCustomersRouter } from '../../src/control-plane/customers-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import { resetJwksCache } from '../../src/auth/oidc-verifier'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const SECRET = 'auth-mode-toggle-test-secret-must-be-32-chars'
const AUDIENCE = 'https://opensteward.toggle.test'

const jose = await import('jose')

let idp: Server
let issuerUrl: string
let jwksUri: string
let signingKey: CryptoKey
let publicJwk: Record<string, unknown>
let previousAllowPrivate: string | undefined

beforeEach(async () => {
  previousAllowPrivate = process.env['OST_ALLOW_PRIVATE_HOSTS']
  process.env['OST_ALLOW_PRIVATE_HOSTS'] = '1'
})

afterEach(() => {
  if (previousAllowPrivate === undefined) delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  else process.env['OST_ALLOW_PRIVATE_HOSTS'] = previousAllowPrivate
})

interface Harness {
  fastify: FastifyInstance
  handle: DbHandle
  apiKeys: ApiKeyStore
  oauth: OAuthClientStore
  setApiKeysEnabled: (v: boolean) => void
  setOauthEnabled: (v: boolean) => void
}

async function setup(): Promise<Harness> {
  const handle = await openDb({ sqlitePath: ':memory:' })
  const apiKeys = await ApiKeyStore.create(handle, SECRET)
  const endUsers = await EndUserStore.create(handle, SECRET)
  const sessions = await ConnectSessionStore.create(handle)
  const credentials = await CredentialStore.create(handle, SECRET)
  const oauth = await OAuthClientStore.create(handle)

  let apiKeysOn = true
  let oauthOn = true

  const fastify = Fastify({ logger: false })
  await fastify.register(
    createCustomersRouter({
      apiKeys,
      endUsers,
      sessions,
      credentials,
      oauth,
      apiKeysEnabled: () => apiKeysOn,
      oauthEnabled: () => oauthOn,
    }),
  )
  await fastify.ready()
  return {
    fastify,
    handle,
    apiKeys,
    oauth,
    setApiKeysEnabled: (v) => {
      apiKeysOn = v
    },
    setOauthEnabled: (v) => {
      oauthOn = v
    },
  }
}

beforeEach(async () => {
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
  const { port } = idp.address() as AddressInfo
  issuerUrl = `http://127.0.0.1:${port}`
  jwksUri = `${issuerUrl}/jwks`
  resetJwksCache()
})

afterEach(async () => {
  await new Promise<void>((resolve) => idp.close(() => resolve()))
})

async function mintJwt(): Promise<string> {
  return new jose.SignJWT({ azp: 'billing-service', scope: 'customers:read' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setIssuer(issuerUrl)
    .setAudience(AUDIENCE)
    .setExpirationTime('5m')
    .sign(signingKey)
}

describe('accepting either credential', () => {
  let h: Harness
  let key: string
  let jwt: string

  beforeEach(async () => {
    resetRateLimitBuckets()
    h = await setup()
    key = (await h.apiKeys.mint({ tenantId: 'acme', scopes: ['customers:read'] })).plaintext
    const issuer = await h.oauth.createIssuer({
      name: 'Local IdP',
      issuer: issuerUrl,
      jwksUri,
      audience: AUDIENCE,
      subjectClaim: 'azp',
      scopeClaim: 'scope',
    })
    await h.oauth.createClient({
      issuerId: issuer.id,
      subject: 'billing-service',
      tenantId: 'acme',
      scopes: ['customers:read'],
    })
    jwt = await mintJwt()
  })

  afterEach(async () => {
    await h.fastify.close()
    await h.handle.close()
  })

  const get = (token: string) =>
    h.fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${token}` },
    })

  it('lets both in when both are enabled', async () => {
    expect((await get(key)).statusCode).toBe(200)
    expect((await get(jwt)).statusCode).toBe(200)
  })

  it('refuses API keys with 403 API_KEYS_DISABLED once switched off', async () => {
    h.setApiKeysEnabled(false)
    const res = await get(key)
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('API_KEYS_DISABLED')
    // The other credential is untouched.
    expect((await get(jwt)).statusCode).toBe(200)
  })

  it('refuses OIDC tokens with 403 OAUTH_DISABLED once switched off', async () => {
    h.setOauthEnabled(false)
    const res = await get(jwt)
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('OAUTH_DISABLED')
    expect((await get(key)).statusCode).toBe(200)
  })

  it('reads both settings per request, not once at boot', async () => {
    // The whole reason the resolvers are functions. A boot-time read would
    // make the admin UI's toggle a lie until the next deploy.
    h.setApiKeysEnabled(false)
    expect((await get(key)).statusCode).toBe(403)
    h.setApiKeysEnabled(true)
    expect((await get(key)).statusCode).toBe(200)

    h.setOauthEnabled(false)
    expect((await get(jwt)).statusCode).toBe(403)
    h.setOauthEnabled(true)
    expect((await get(jwt)).statusCode).toBe(200)
  })

  it('refuses both when both are off', async () => {
    h.setApiKeysEnabled(false)
    h.setOauthEnabled(false)
    expect((await get(key)).json().error.code).toBe('API_KEYS_DISABLED')
    expect((await get(jwt)).json().error.code).toBe('OAUTH_DISABLED')
  })

  it('still refuses a revoked key rather than reporting it as disabled', async () => {
    // The toggle must not mask an ordinary auth failure — an operator reading
    // 403 API_KEYS_DISABLED would go looking in the wrong place.
    const [row] = await h.apiKeys.list('acme')
    await h.apiKeys.revoke(row.id)
    const res = await get(key)
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })
})

describe('a deployment with no issuer configured', () => {
  it('refuses a JWT as disabled rather than crashing on a missing store', async () => {
    resetRateLimitBuckets()
    const handle = await openDb({ sqlitePath: ':memory:' })
    const apiKeys = await ApiKeyStore.create(handle, SECRET)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const sessions = await ConnectSessionStore.create(handle)
    const credentials = await CredentialStore.create(handle, SECRET)

    const fastify = Fastify({ logger: false })
    // No `oauth` store at all — the wiring an older deployment has.
    await fastify.register(createCustomersRouter({ apiKeys, endUsers, sessions, credentials }))
    await fastify.ready()

    const res = await fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${await mintJwt()}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('OAUTH_DISABLED')

    // And an API key still works, because omitting the toggles means enabled.
    const key = (await apiKeys.mint({ tenantId: 'acme', scopes: ['customers:read'] })).plaintext
    const ok = await fastify.inject({
      method: 'GET',
      url: '/v1/customers',
      headers: { authorization: `Bearer ${key}` },
    })
    expect(ok.statusCode).toBe(200)

    await fastify.close()
    await handle.close()
  })
})

describe('X-Admin-Secret is never gated by either toggle', () => {
  // The point of the whole feature being survivable. An operator who switches
  // API keys off against a broken OIDC setup, or whose IdP goes down at 3am,
  // has to be able to reach /admin/* and turn it back on. Driven against the
  // unified middleware with stubbed stores, the same way the host→tenant
  // isolation tests are, because that is the only path that accepts the
  // header at all.
  const UUID = '11111111-1111-4111-8111-111111111111'

  function makeReply() {
    const res: { statusCode?: number; body?: { error?: { code?: string } } } = {}
    const reply = {
      status(code: number) {
        res.statusCode = code
        return reply
      },
      send(body: unknown) {
        res.body = body as { error?: { code?: string } }
        return reply
      },
      header() {
        return reply
      },
    }
    return { reply, res }
  }

  beforeEach(() => {
    process.env['ADMIN_SECRET'] = 'top-secret'
  })
  afterEach(() => {
    delete process.env['ADMIN_SECRET']
  })

  it('gets through with both developer credentials switched off', async () => {
    const { createUnifiedAuthMiddleware } = await import('../../src/control-plane/auth-middleware')
    const handle = await openDb({ sqlitePath: ':memory:' })
    const apiKeys = await ApiKeyStore.create(handle, SECRET)
    const sessions = await ConnectSessionStore.create(handle)
    const oauth = await OAuthClientStore.create(handle)

    const mw = createUnifiedAuthMiddleware({
      store: { getRow: () => ({ vertical: 'crm', platform: 'x' }) } as never,
      registry: { get: () => null } as never,
      apiKeys,
      sessions,
      oauth,
      apiKeysEnabled: () => false,
      oauthEnabled: () => false,
    })

    const request = {
      query: { connection_id: UUID },
      headers: { 'x-admin-secret': 'top-secret' },
      method: 'GET',
    }
    const { reply, res } = makeReply()
    await mw(request as never, reply as never)

    // Reaches the adapter lookup and fails there — which is proof it got past
    // auth entirely, rather than being refused as a disabled credential.
    expect(res.body?.error?.code).toBe('ADAPTER_UNAVAILABLE')
    expect(res.body?.error?.code).not.toBe('API_KEYS_DISABLED')

    await handle.close()
  })
})
