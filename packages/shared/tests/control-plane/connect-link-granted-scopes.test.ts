/**
 * A Connect Link's scope override reaches the token exchange.
 *
 * Some platforms make the token request repeat the authorize scopes — Faire's
 * token endpoint documents `scope` as "A list of the permissions that your
 * application requests. _This list must match the previously provided scope
 * parameter_." Before this, the override a link resolved at oauth-start went to
 * `getAuthUrl` and nowhere else, so the exchange could only send the adapter's
 * configured scopes and an overridden link failed there.
 *
 * The contract pinned here: the callback hands `exchangeCodeWithScopes` exactly
 * the array oauth-start handed `getAuthUrl`, and `undefined` when the link had
 * no override. An adapter that does not implement it keeps `exchangeCode`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { createConnectRouter } from '../../src/control-plane/connect-router'
import { createUnifiedAuthRouter } from '../../src/control-plane/auth-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import type { HostBranding } from '../../src/control-plane/host-info'

const SECRET = 'connect-granted-scopes-secret-must-be-32'

const hostInfo = {
  get: async (): Promise<HostBranding> => ({
    name: null,
    logoDataUrl: null,
    primaryColor: null,
    secondaryColor: null,
    fontFamily: null,
    fontDataUrl: null,
    fontUrl: null,
    faviconDataUrl: null,
    hideAttribution: false,
    supportEmail: null,
    privacyPolicyUrl: null,
    termsOfServiceUrl: null,
    baseUrl: null,
  }),
} as never

const READ_SCOPES = ['READ_PRODUCTS', 'READ_ORDERS']

const scoped = {
  getAuthUrl: vi.fn((state: string) => `https://scoped.example/authorize?state=${state}`),
  exchangeCode: vi.fn(async () => ({ accessToken: 'plain' })),
  exchangeCodeWithScopes: vi.fn(async () => ({ accessToken: 'scoped' })),
  refreshCredentials: async (c: unknown) => c,
}
const plain = {
  getAuthUrl: vi.fn((state: string) => `https://plain.example/authorize?state=${state}`),
  exchangeCode: vi.fn(async () => ({ accessToken: 'plain' })),
  refreshCredentials: async (c: unknown) => c,
}
// Implements the scopes exchange alongside the inputs one: inputs win.
const inputsAndScopes = {
  oauthFields: () => [{ name: 'shop', label: 'Shop', type: 'text', required: true }],
  getAuthUrl: vi.fn((state: string) => `https://inputs.example/authorize?state=${state}`),
  exchangeCode: vi.fn(async () => ({ accessToken: 'plain' })),
  exchangeCodeWithInputs: vi.fn(async () => ({ accessToken: 'inputs' })),
  exchangeCodeWithScopes: vi.fn(async () => ({ accessToken: 'scoped' })),
  refreshCredentials: async (c: unknown) => c,
}
// Implements the scopes exchange alongside PKCE: the verifier wins.
const pkceAndScopes = {
  capabilities: { requiresPkce: true },
  getAuthUrl: vi.fn((state: string) => `https://pkce.example/authorize?state=${state}`),
  exchangeCode: vi.fn(async () => ({ accessToken: 'plain' })),
  exchangeCodeWithVerifier: vi.fn(async () => ({ accessToken: 'verifier' })),
  exchangeCodeWithScopes: vi.fn(async () => ({ accessToken: 'scoped' })),
  refreshCredentials: async (c: unknown) => c,
}
const ADAPTERS: Record<string, unknown> = {
  scoped,
  plain,
  'inputs-and-scopes': inputsAndScopes,
  'pkce-and-scopes': pkceAndScopes,
}

const PLATFORMS = [
  {
    vertical: 'ecommerce',
    slug: 'scoped',
    name: 'Scoped',
    auth_type: 'oauth2',
    readScopes: READ_SCOPES,
  },
  {
    vertical: 'ecommerce',
    slug: 'plain',
    name: 'Plain',
    auth_type: 'oauth2',
    readScopes: READ_SCOPES,
  },
  {
    vertical: 'ecommerce',
    slug: 'inputs-and-scopes',
    name: 'Inputs and scopes',
    auth_type: 'oauth2',
    readScopes: READ_SCOPES,
  },
  {
    vertical: 'ecommerce',
    slug: 'pkce-and-scopes',
    name: 'PKCE and scopes',
    auth_type: 'oauth2',
    readScopes: READ_SCOPES,
  },
] as never

describe('Connect Link scope override at token exchange', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let sessions: ConnectSessionStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    for (const fn of [
      scoped.getAuthUrl,
      scoped.exchangeCode,
      scoped.exchangeCodeWithScopes,
      plain.getAuthUrl,
      plain.exchangeCode,
      inputsAndScopes.getAuthUrl,
      inputsAndScopes.exchangeCode,
      inputsAndScopes.exchangeCodeWithInputs,
      inputsAndScopes.exchangeCodeWithScopes,
      pkceAndScopes.getAuthUrl,
      pkceAndScopes.exchangeCode,
      pkceAndScopes.exchangeCodeWithVerifier,
      pkceAndScopes.exchangeCodeWithScopes,
    ])
      fn.mockClear()
    handle = await openDb({ sqlitePath: ':memory:' })
    sessions = await ConnectSessionStore.create(handle)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const store = await CredentialStore.create(handle, SECRET)
    const registry = {
      get: (_v: string, slug: string) => ADAPTERS[slug] ?? null,
    } as never
    fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectRouter({ store, registry, sessions, endUsers, hostInfo, platforms: PLATFORMS }),
    )
    await fastify.register(createUnifiedAuthRouter({ store, registry, connectSessions: sessions }))
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    handle.close()
  })

  type Link = { scopePolicy: 'read_only' | 'platform_default' | 'custom'; scopes?: string[] }

  async function start(platform: string, link: Link, fields?: Record<string, string>) {
    const s = await sessions.create({ tenantId: 't', label: 'l', ...link })
    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${s.token}/oauth-start`,
      payload: { vertical: 'ecommerce', platform, ...(fields ? { fields } : {}) },
    })
    expect(res.statusCode).toBe(200)
    return new URL(res.json().data.redirectUrl as string).searchParams.get('state')!
  }

  async function callback(platform: string, state: string, code = 'c0de') {
    const cb = await fastify.inject({
      method: 'GET',
      url: `/auth/ecommerce/${platform}/callback?code=${code}&state=${state}`,
    })
    expect(cb.statusCode).toBeLessThan(400)
  }

  async function startAndCallback(platform: string, link: Link, fields?: Record<string, string>) {
    const state = await start(platform, link, fields)
    await callback(platform, state)
    return state
  }

  it('passes the read_only override that authorize used to the exchange', async () => {
    await startAndCallback('scoped', { scopePolicy: 'read_only' })
    const authorizeScopes = scoped.getAuthUrl.mock.calls[0]![1]
    expect(authorizeScopes).toEqual(READ_SCOPES)
    expect(scoped.exchangeCodeWithScopes).toHaveBeenCalledTimes(1)
    expect(scoped.exchangeCodeWithScopes.mock.calls[0]).toEqual([
      'c0de',
      expect.any(String),
      authorizeScopes,
    ])
    expect(scoped.exchangeCode).not.toHaveBeenCalled()
  })

  it('passes a custom override verbatim', async () => {
    await startAndCallback('scoped', { scopePolicy: 'custom', scopes: ['WRITE_ORDERS'] })
    expect(scoped.getAuthUrl.mock.calls[0]![1]).toEqual(['WRITE_ORDERS'])
    expect(scoped.exchangeCodeWithScopes.mock.calls[0]![2]).toEqual(['WRITE_ORDERS'])
  })

  it('passes undefined when the link has no override', async () => {
    await startAndCallback('scoped', { scopePolicy: 'platform_default' })
    expect(scoped.getAuthUrl.mock.calls[0]![1]).toBeUndefined()
    expect(scoped.exchangeCodeWithScopes).toHaveBeenCalledTimes(1)
    expect(scoped.exchangeCodeWithScopes.mock.calls[0]).toEqual([
      'c0de',
      expect.any(String),
      undefined,
    ])
  })

  it('leaves an adapter without exchangeCodeWithScopes on its two-argument exchangeCode', async () => {
    await startAndCallback('plain', { scopePolicy: 'read_only' })
    // Exactly two arguments: QuickBooks, Medius and Silverfin already use the
    // third slot for something else, so a scope array must never land there.
    expect(plain.exchangeCode.mock.calls[0]).toEqual(['c0de', expect.any(String)])
  })

  // Callback precedence: inputs, then the PKCE verifier, then scopes. An adapter
  // that implements more than one must not silently lose its inputs or verifier.
  it('prefers exchangeCodeWithInputs over exchangeCodeWithScopes', async () => {
    await startAndCallback('inputs-and-scopes', { scopePolicy: 'read_only' }, { shop: 'acme' })
    expect(inputsAndScopes.exchangeCodeWithInputs).toHaveBeenCalledTimes(1)
    expect(inputsAndScopes.exchangeCodeWithInputs.mock.calls[0]![2]).toEqual({ shop: 'acme' })
    expect(inputsAndScopes.exchangeCodeWithScopes).not.toHaveBeenCalled()
    expect(inputsAndScopes.exchangeCode).not.toHaveBeenCalled()
  })

  it('prefers exchangeCodeWithVerifier over exchangeCodeWithScopes', async () => {
    await startAndCallback('pkce-and-scopes', { scopePolicy: 'read_only' })
    expect(pkceAndScopes.exchangeCodeWithVerifier).toHaveBeenCalledTimes(1)
    expect(pkceAndScopes.exchangeCodeWithVerifier.mock.calls[0]![2]).toEqual(expect.any(String))
    expect(pkceAndScopes.exchangeCodeWithScopes).not.toHaveBeenCalled()
    expect(pkceAndScopes.exchangeCode).not.toHaveBeenCalled()
  })

  it('keeps each session its own override when callbacks arrive in reverse order', async () => {
    // Both sessions start before either callback, and the later one returns
    // first: each exchange must see the override its own authorize used.
    const readOnly = await start('scoped', { scopePolicy: 'read_only' })
    const custom = await start('scoped', { scopePolicy: 'custom', scopes: ['WRITE_ORDERS'] })
    await callback('scoped', custom, 'code-custom')
    await callback('scoped', readOnly, 'code-read')
    const byCode = Object.fromEntries(
      scoped.exchangeCodeWithScopes.mock.calls.map((c) => [c[0], c[2]]),
    )
    expect(byCode).toEqual({ 'code-custom': ['WRITE_ORDERS'], 'code-read': READ_SCOPES })
  })
})
