/**
 * Journey: an operator signs in to the admin UI through SSO, with the mock
 * identity provider from `@opensteward/shared` standing in for Okta, Entra or
 * Keycloak.
 *
 * Every hop is the real one: `GET /api/sso/:slug/login` builds the
 * authorization request, the IdP (a `node:http` server, since openid-client
 * fetches discovery, the token endpoint and userinfo over real HTTP) answers
 * with a code, `GET /api/sso/:slug/callback` exchanges it with PKCE and
 * verifies the id_token, and `POST /api/sso/handoff/exchange` turns the
 * one-time handoff code into the JWT the admin UI puts in its cookie.
 *
 * The persona's `groups` claim goes through the role-mapping rules the admin
 * registered, so the test also proves an IdP group becomes an OpenSteward
 * role — the promise an operator relies on when they stop using passwords.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  createMockIssuerKeys,
  createMockOidcLogin,
  jwksDocument,
  readNodeRequest,
  writeNodeResponse,
  type MockOidcLogin,
} from '@opensteward/shared'
import { buildAdminApiTestServer, setupAdmin, type AdminApiTestServer } from './helpers'

const CLIENT_ID = 'opensteward-admin'
const CLIENT_SECRET = 'dev-secret'
const SLUG = 'dev'

let idp: Server
let issuer = ''
let login: MockOidcLogin | undefined

function writeJson(res: ServerResponse, body: unknown): void {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

beforeAll(async () => {
  const keys = await createMockIssuerKeys('journey-1')
  idp = createServer(async (nodeReq, res) => {
    const req = await readNodeRequest(nodeReq)
    const path = new URL(req.url, issuer).pathname
    if (path === '/.well-known/openid-configuration') return writeJson(res, login!.discovery())
    if (path === '/jwks') return writeJson(res, jwksDocument(keys))
    const out = await login!.handle(req)
    if (out) return writeNodeResponse(res, out)
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((resolve) => idp.listen(0, '127.0.0.1', resolve))
  issuer = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`
  login = createMockOidcLogin({ issuer, keys, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET })
})

afterAll(() => new Promise<void>((resolve) => idp.close(() => resolve())))

let server: AdminApiTestServer
let adminToken: string

beforeEach(async () => {
  server = await buildAdminApiTestServer()
  adminToken = await setupAdmin(server)
  const created = await server.fastify.inject({
    method: 'POST',
    url: '/api/identity-providers',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name: 'Dev IdP',
      slug: SLUG,
      protocol: 'oidc',
      enabled: true,
      config: {
        issuer,
        clientId: CLIENT_ID,
        scopes: 'openid profile email',
        groupsClaim: 'groups',
      },
      secret: { clientSecret: CLIENT_SECRET },
      jitEnabled: true,
      defaultRole: 'viewer',
    },
  })
  expect(created.statusCode).toBe(201)
  const providerId = created.json().data.id as string
  for (const [group, role] of [
    ['ost-admins', 'admin'],
    ['ost-operators', 'operator'],
  ] as const) {
    const rule = await server.fastify.inject({
      method: 'POST',
      url: `/api/identity-providers/${providerId}/role-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        claimPath: 'groups',
        matchType: 'contains',
        matchValue: group,
        role,
        priority: 10,
      },
    })
    expect(rule.statusCode).toBe(201)
  }
})

afterEach(async () => {
  await server?.cleanup()
})

interface SignedIn {
  token: string
  user: { id: string; username: string; role: string }
  handoff: string
}

/** The browser's round trip, hop by hop. */
async function signIn(persona: string, returnTo = '/connections'): Promise<SignedIn> {
  const start = await server.fastify.inject({
    method: 'GET',
    url: `/api/sso/${SLUG}/login?return_to=${encodeURIComponent(returnTo)}`,
  })
  expect(start.statusCode).toBe(302)
  const authorize = new URL(start.headers['location'] as string)
  expect(authorize.origin).toBe(issuer)
  expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')

  // The IdP's login page, with the persona chosen up front.
  authorize.searchParams.set('login_hint', persona)
  const idpRes = await fetch(authorize, { redirect: 'manual' })
  expect(idpRes.status).toBe(302)
  const back = new URL(idpRes.headers.get('location')!)
  expect(`${back.origin}${back.pathname}`).toBe(`http://localhost:3001/api/sso/${SLUG}/callback`)

  const callback = await server.fastify.inject({
    method: 'GET',
    url: `${back.pathname}${back.search}`,
  })
  expect(callback.statusCode, callback.payload).toBe(302)
  const complete = new URL(callback.headers['location'] as string)
  expect(`${complete.origin}${complete.pathname}`).toBe('http://localhost:3000/login/sso/complete')
  expect(complete.searchParams.get('return_to')).toBe(returnTo)

  const handoff = complete.searchParams.get('code')!
  const exchange = await server.fastify.inject({
    method: 'POST',
    url: '/api/sso/handoff/exchange',
    payload: { code: handoff },
  })
  expect(exchange.statusCode).toBe(200)
  return { ...(exchange.json() as Omit<SignedIn, 'handoff'>), handoff }
}

describe('Journey: An operator signs in through SSO against the mock IdP', () => {
  it('offers the provider on the login page', async () => {
    const res = await server.fastify.inject({ method: 'GET', url: '/api/sso/login-options' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.providers).toEqual([
      expect.objectContaining({ slug: SLUG, name: 'Dev IdP', protocol: 'oidc' }),
    ])
  })

  it('a member of the admins group arrives as an admin, provisioned from her email, with a working token', async () => {
    const alice = await signIn('alice')
    expect(alice.user.role).toBe('admin')
    expect(alice.user.username).toContain('alice')

    const me = await server.fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().user?.id ?? me.json().id).toBe(alice.user.id)
  })

  it('maps the operators group to operator, and no group to the default role', async () => {
    expect((await signIn('bob')).user.role).toBe('operator')
    expect((await signIn('carol')).user.role).toBe('viewer')
  })

  it('signing in again is the same account, not a second one', async () => {
    const first = await signIn('alice')
    const second = await signIn('alice')
    expect(second.user.id).toBe(first.user.id)
  })

  it('the handoff code works once', async () => {
    const alice = await signIn('alice')
    const again = await server.fastify.inject({
      method: 'POST',
      url: '/api/sso/handoff/exchange',
      payload: { code: alice.handoff },
    })
    expect(again.statusCode).toBe(400)
  })

  it('refuses a callback whose state this deployment never issued', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/api/sso/${SLUG}/callback?code=whatever&state=not-ours`,
    })
    expect(res.statusCode).toBe(400)
  })
})
