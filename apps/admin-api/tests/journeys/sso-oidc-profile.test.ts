/**
 * Journey: an operator signs in through OIDC and their console profile —
 * email and picture — comes from the identity provider.
 *
 * The same real round trip as sso-oidc-login.test.ts (mock IdP on loopback,
 * PKCE, signed id_token, userinfo), with personas that carry
 * `email_verified` and `picture`. The picture fetch is stubbed except in the
 * SSRF case, where the real guard refuses a private address before any
 * connection is attempted — and the sign-in succeeds regardless.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  createMockIssuerKeys,
  createMockOidcLogin,
  jwksDocument,
  readNodeRequest,
  writeNodeResponse,
  type MockOidcLogin,
  type MockPersona,
} from '@opensteward/shared'
import { buildAdminApiTestServer, setupAdmin, type AdminApiTestServer } from './helpers'
import { UserAvatarStore } from '../../src/core/db/user-avatar-store'
import { fetchIdpAvatar } from '../../src/core/auth/idp/avatar-fetch'
import type { AvatarFetcher } from '../../src/core/auth/idp/profile-sync'
import { PNG_1X1 } from '../unit/avatar-fixtures'

const CLIENT_ID = 'opensteward-admin'
const CLIENT_SECRET = 'dev-secret'
const SLUG = 'dev'

/** Mutable on purpose: a test changes what the IdP asserts between sign-ins. */
const personas: MockPersona[] = []

let idp: Server
let issuer = ''
let login: MockOidcLogin | undefined

function writeJson(res: ServerResponse, body: unknown): void {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

beforeAll(async () => {
  const keys = await createMockIssuerKeys('journey-profile')
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
  login = createMockOidcLogin({ issuer, keys, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, personas })
})

afterAll(() => new Promise<void>((resolve) => idp.close(() => resolve())))

let server: AdminApiTestServer
let adminToken: string

async function boot(avatarFetcher: AvatarFetcher): Promise<void> {
  personas.splice(
    0,
    personas.length,
    { id: 'erin', email: 'erin@example.test', name: 'Erin', groups: [], picture: 'https://pics.example/erin.png?sig=abc' },
    { id: 'frank', email: 'frank@example.test', name: 'Frank', groups: [], emailVerified: false },
    { id: 'gina', email: 'gina@example.test', name: 'Gina', groups: [], picture: 'https://10.0.0.7/gina.png' },
  )
  server = await buildAdminApiTestServer({ avatarFetcher })
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
      config: { issuer, clientId: CLIENT_ID, scopes: 'openid profile email', groupsClaim: 'groups' },
      secret: { clientSecret: CLIENT_SECRET },
      jitEnabled: true,
      defaultRole: 'viewer',
    },
  })
  expect(created.statusCode).toBe(201)
}

afterEach(async () => {
  await server?.cleanup()
})

/** The browser's round trip; returns the signed-in user's id. */
async function signIn(persona: string): Promise<string> {
  const start = await server.fastify.inject({ method: 'GET', url: `/api/sso/${SLUG}/login?return_to=%2F` })
  expect(start.statusCode).toBe(302)
  const authorize = new URL(start.headers['location'] as string)
  authorize.searchParams.set('login_hint', persona)
  const idpRes = await fetch(authorize, { redirect: 'manual' })
  const back = new URL(idpRes.headers.get('location')!)
  const callback = await server.fastify.inject({ method: 'GET', url: `${back.pathname}${back.search}` })
  // A sign-in never waits on, or fails because of, the picture.
  expect(callback.statusCode, callback.payload).toBe(302)
  const code = new URL(callback.headers['location'] as string).searchParams.get('code')!
  const exchange = await server.fastify.inject({
    method: 'POST',
    url: '/api/sso/handoff/exchange',
    payload: { code },
  })
  expect(exchange.statusCode).toBe(200)
  return exchange.json().user.id as string
}

describe('Journey: an SSO sign-in fills the console profile', () => {
  it('copies a verified email and fetches the picture, once per URL', async () => {
    const fetcher = vi.fn(async () => ({ bytes: PNG_1X1, contentType: 'image/png' as const }))
    await boot(fetcher)
    const id = await signIn('erin')
    await server.idpProfileSync.idle()

    const user = await server.adminStore.getUserById(id)
    expect(user?.email).toBe('erin@example.test')
    expect(user?.email_source).toBe('idp')
    expect(fetcher).toHaveBeenCalledWith('https://pics.example/erin.png?sig=abc')
    expect((await UserAvatarStore.for(server.adminStore).head(id))?.source).toBe('idp')

    await signIn('erin')
    await server.idpProfileSync.idle()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refreshes an IdP email at the next sign-in, but never one an admin set', async () => {
    await boot(vi.fn(async () => ({ bytes: PNG_1X1, contentType: 'image/png' as const })))
    const id = await signIn('erin')
    personas[0]!.email = 'erin.renamed@example.test'
    await signIn('erin')
    expect((await server.adminStore.getUserById(id))?.email).toBe('erin.renamed@example.test')

    const set = await server.fastify.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'erin@console.example' },
    })
    expect(set.statusCode).toBe(200)
    personas[0]!.email = 'erin.again@example.test'
    await signIn('erin')
    expect((await server.adminStore.getUserById(id))?.email).toBe('erin@console.example')
  })

  it('ignores an email the IdP marks unverified', async () => {
    await boot(vi.fn(async () => ({ bytes: PNG_1X1, contentType: 'image/png' as const })))
    const id = await signIn('frank')
    expect((await server.adminStore.getUserById(id))?.email ?? null).toBeNull()
  })

  it('refuses a picture URL on a private address, and the sign-in still succeeds', async () => {
    // The real fetcher: the guard refuses 10.0.0.7 before any socket opens.
    const real = vi.fn((url: string) => fetchIdpAvatar(url))
    await boot(real)
    const id = await signIn('gina')
    await server.idpProfileSync.idle()
    expect(real).toHaveBeenCalledWith('https://10.0.0.7/gina.png')
    await expect(real.mock.results[0]!.value).rejects.toMatchObject({ reason: 'blocked_address' })
    expect(await UserAvatarStore.for(server.adminStore).head(id)).toBeNull()
    expect((await server.adminStore.getUserById(id))?.email).toBe('gina@example.test')
  })
})
