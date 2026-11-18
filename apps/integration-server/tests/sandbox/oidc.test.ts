/**
 * Journey: a developer rehearses the OIDC flow against the sandbox, with the
 * deployment's own test issuer standing in for their identity provider.
 *
 * The operator's steps are the production ones — register the issuer
 * (sandbox preset), register the developer's subject as a service account
 * with a tenant and scopes — and the developer's step is the production one
 * too: get a token from the token endpoint and send it where a key would go.
 * What differs is only where it works: `/test/v1/*` accepts it, `/v1/*`
 * refuses it, exactly the boundary an `osk_test_` key lives inside.
 *
 * No network: the sandbox verifies against the key it holds in memory. The
 * token endpoint is authenticated by a test key, which is also what pins the
 * tenant claim — a token can never assert a tenant its key cannot reach.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { sandboxConnectionId, SANDBOX_ISSUER_PRESET } from '@opensteward/shared'

const TENANT = 'default'
const VERTICAL = 'accounting'
const BASE = 'http://localhost:3010'
const ISSUER = `${BASE}/test/oidc`
const AUDIENCE = 'https://opensteward.sandbox.test'

let saved: Record<string, string | undefined>
function setEnv(values: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

async function mintToken(
  server: TestServer,
  body: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return server.fastify.inject({
    method: 'POST',
    url: '/test/oidc/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    payload: new URLSearchParams(body).toString(),
  })
}

describe('/test/oidc — the sandbox test issuer', () => {
  let server: TestServer
  let testKey: string
  let liveKey: string
  let issuerId: string
  const connectionId = sandboxConnectionId(TENANT, VERTICAL)

  beforeAll(async () => {
    saved = {
      AUTH_DEV_OAUTH_ENABLED: process.env['AUTH_DEV_OAUTH_ENABLED'],
      PUBLIC_BASE_URL: process.env['PUBLIC_BASE_URL'],
    }
    // The base URL fixes the issuer string so it matches what is registered;
    // OIDC is switched on the way an operator would from the environment.
    setEnv({ AUTH_DEV_OAUTH_ENABLED: '1', PUBLIC_BASE_URL: BASE })
    server = await buildTestServer()
    testKey = (
      await server.apiKeys.mint({ tenantId: TENANT, scopes: ['vertical:accounting'], mode: 'test' })
    ).plaintext
    liveKey = (await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'] })).plaintext
    // The operator's side: this deployment's test issuer, registry mode, and
    // one service account for the developer's subject.
    const issuer = await server.oauthClients.createIssuer({
      name: 'Sandbox test issuer',
      preset: SANDBOX_ISSUER_PRESET,
      issuer: ISSUER,
      jwksUri: `${ISSUER}/jwks`,
      audience: AUDIENCE,
      subjectClaim: 'sub',
      scopeClaim: 'scope',
    })
    issuerId = issuer.id
    await server.oauthClients.createClient({
      issuerId,
      subject: 'billing-service',
      tenantId: TENANT,
      scopes: ['customers:read', `vertical:${VERTICAL}`],
    })
  }, 60_000)

  afterAll(async () => {
    await server?.cleanup()
    setEnv(saved)
  })

  const auth = (bearer: string) => ({ authorization: `Bearer ${bearer}` })
  const resource = `/test/v1/${VERTICAL}/invoices?connection_id=${connectionId}`

  it('publishes discovery and a JWKS under the issuer URL an operator registers', async () => {
    const disco = await server.fastify.inject({
      method: 'GET',
      url: '/test/oidc/.well-known/openid-configuration',
    })
    expect(disco.statusCode).toBe(200)
    expect(disco.json()).toMatchObject({
      issuer: ISSUER,
      jwks_uri: `${ISSUER}/jwks`,
      token_endpoint: `${ISSUER}/token`,
    })
    const jwks = await server.fastify.inject({ method: 'GET', url: '/test/oidc/jwks' })
    expect(jwks.statusCode).toBe(200)
    expect((jwks.json() as { keys: Array<{ kid: string }> }).keys[0]!.kid).toBeTruthy()
  })

  it('mints a token for a subject against a test key, form-encoded like a real client', async () => {
    const res = await mintToken(server, {
      grant_type: 'client_credentials',
      client_id: 'billing-service',
      client_secret: testKey,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { access_token: string; token_type: string; expires_in: number }
    expect(body.token_type).toBe('Bearer')
    expect(body.expires_in).toBe(3600)
    expect(body.access_token.split('.')).toHaveLength(3)
  })

  it('also takes client credentials the Basic way, and a JSON body', async () => {
    const basic = Buffer.from(`billing-service:${testKey}`).toString('base64')
    const viaBasic = await mintToken(
      server,
      { grant_type: 'client_credentials' },
      { authorization: `Basic ${basic}` },
    )
    expect(viaBasic.statusCode).toBe(200)
    const viaJson = await server.fastify.inject({
      method: 'POST',
      url: '/test/oidc/token',
      payload: {
        grant_type: 'client_credentials',
        client_id: 'billing-service',
        client_secret: testKey,
      },
    })
    expect(viaJson.statusCode).toBe(200)
  })

  it('is admitted to the sandbox with that token, through the registered service account', async () => {
    const minted = (
      await mintToken(server, {
        grant_type: 'client_credentials',
        client_id: 'billing-service',
        client_secret: testKey,
      })
    ).json() as { access_token: string }
    const res = await server.fastify.inject({
      method: 'GET',
      url: resource,
      headers: auth(minted.access_token),
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { data: unknown[] }).data.length).toBeGreaterThan(0)
  })

  it('is admitted to the control plane, the meta routes and the sync simulator with the same token', async () => {
    // These surfaces each resolve the credential themselves. The first cut
    // taught only the vertical resource middleware about tokens, and
    // `GET /test/v1/connections` — the documented first call — answered
    // "Invalid or revoked API key" to a valid one.
    const minted = (
      await mintToken(server, {
        grant_type: 'client_credentials',
        client_id: 'billing-service',
        client_secret: testKey,
      })
    ).json() as { access_token: string }
    const headers = auth(minted.access_token)
    const connections = await server.fastify.inject({
      method: 'GET',
      url: '/test/v1/connections',
      headers,
    })
    expect(connections.statusCode).toBe(200)
    expect((connections.json() as { data: Array<{ id: string }> }).data.map((c) => c.id)).toContain(
      connectionId,
    )
    const customers = await server.fastify.inject({
      method: 'GET',
      url: '/test/v1/customers',
      headers,
    })
    expect(customers.statusCode).toBe(200)
    const sync = await server.fastify.inject({
      method: 'POST',
      url: `/test/v1/${VERTICAL}/sync?connection_id=${connectionId}`,
      headers,
    })
    expect([200, 202]).toContain(sync.statusCode)
  })

  it('refuses a subject nobody registered — the registry decides, as in production', async () => {
    const minted = (
      await mintToken(server, {
        grant_type: 'client_credentials',
        client_id: 'nobody-registered-this',
        client_secret: testKey,
      })
    ).json() as { access_token: string }
    const res = await server.fastify.inject({
      method: 'GET',
      url: resource,
      headers: auth(minted.access_token),
    })
    expect(res.statusCode).toBe(401)
  })

  it('refuses the same token on /v1/* as a test credential, without fetching anything', async () => {
    const minted = (
      await mintToken(server, {
        grant_type: 'client_credentials',
        client_id: 'billing-service',
        client_secret: testKey,
      })
    ).json() as { access_token: string }
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/v1/${VERTICAL}/invoices?connection_id=${connectionId}`,
      headers: auth(minted.access_token),
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: { code: string } }).error.code).toBe('KEY_MODE_MISMATCH')
  })

  it('refuses to mint against a live key — the token would cross the boundary the key cannot', async () => {
    const res = await mintToken(server, {
      grant_type: 'client_credentials',
      client_id: 'billing-service',
      client_secret: liveKey,
    })
    expect(res.statusCode).toBe(401)
    expect((res.json() as { error: string }).error).toBe('invalid_client')
  })

  it('refuses any other grant, and names the one it supports', async () => {
    const res = await mintToken(server, {
      grant_type: 'password',
      client_id: 'billing-service',
      client_secret: testKey,
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('unsupported_grant_type')
  })

  it('still takes a test key beside the token — both credentials, one boundary', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: resource,
      headers: auth(testKey),
    })
    expect(res.statusCode).toBe(200)
  })

  it('pins the tenant claim to the key, so token-decides mode cannot be talked into another tenant', async () => {
    // Switch the issuer to token-decides with only `default` allowed, then
    // ask for a token claiming `victim`: the claim is the key's tenant
    // regardless of the request, and the token is admitted as `default`.
    await server.oauthClients.updateIssuer(issuerId, {
      authorityMode: 'external',
      tenantClaim: 'tenant',
      allowedTenants: [TENANT],
    })
    try {
      const minted = (
        await mintToken(server, {
          grant_type: 'client_credentials',
          client_id: 'anyone',
          client_secret: testKey,
          scope: `vertical:${VERTICAL}`,
          tenant: 'victim',
        })
      ).json() as { access_token: string }
      const res = await server.fastify.inject({
        method: 'GET',
        url: resource,
        headers: auth(minted.access_token),
      })
      expect(res.statusCode).toBe(200)
      const victims = await server.fastify.inject({
        method: 'GET',
        url: `/test/v1/${VERTICAL}/invoices?connection_id=${sandboxConnectionId('victim', VERTICAL)}`,
        headers: auth(minted.access_token),
      })
      expect(victims.statusCode).toBe(403)
    } finally {
      await server.oauthClients.updateIssuer(issuerId, { authorityMode: 'registry' })
    }
  })
})

describe('/test/oidc with OIDC switched off', () => {
  let server: TestServer

  beforeAll(async () => {
    saved = {
      AUTH_DEV_OAUTH_ENABLED: process.env['AUTH_DEV_OAUTH_ENABLED'],
      PUBLIC_BASE_URL: process.env['PUBLIC_BASE_URL'],
    }
    setEnv({ AUTH_DEV_OAUTH_ENABLED: undefined, PUBLIC_BASE_URL: BASE })
    server = await buildTestServer()
  }, 60_000)

  afterAll(async () => {
    await server?.cleanup()
    setEnv(saved)
  })

  it('refuses a JWT on the sandbox with OAUTH_DISABLED, as /v1 does — one switch for both', async () => {
    // Any three-part token will do: the switch is checked before the issuer.
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/test/v1/${VERTICAL}/invoices?connection_id=${sandboxConnectionId(TENANT, VERTICAL)}`,
      headers: { authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJ4In0.c2ln' },
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: { code: string } }).error.code).toBe('OAUTH_DISABLED')
  })
})
