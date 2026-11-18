/**
 * The token exchange must send the `redirect_uri` the authorize URL sent.
 *
 * RFC 6749 §4.1.3: when the authorization request carried `redirect_uri`, the
 * token request must carry the identical value. Adapters build their authorize
 * URL from their own configured Redirect URI (the admin field), but the
 * exchange used to replay one derived from `PUBLIC_BASE_URL`. The two agreed
 * only while every adapter was configured on that same origin — point one
 * adapter at `https://localhost/…` (a provider that refuses http callbacks)
 * and its exchange still sent `http://localhost:3010/…`, which the provider
 * rejects as `redirect_uri_mismatch`.
 *
 * Pinned here: pending state records the value the authorize URL actually
 * carried, on both OAuth start paths, so http and https adapters coexist on
 * one deployment. An authorize URL without `redirect_uri` keeps the derived
 * value, as before.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { consumePendingState, redirectUriIn } from '../../src/auth/oauth'
import { createConnectRouter } from '../../src/control-plane/connect-router'
import { createUnifiedAuthRouter } from '../../src/control-plane/auth-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import type { HostBranding } from '../../src/control-plane/host-info'

const SECRET = 'oauth-redirect-uri-echo-secret-32chars!'
const PUBLIC_BASE = 'http://localhost:3010'
const HTTPS_CALLBACK = 'https://localhost/auth/crm/secure/callback'
const HTTP_CALLBACK = 'http://localhost:3010/auth/crm/plain/callback'

function hostBranding(): HostBranding {
  return {
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
  }
}
const hostInfo = { get: async () => hostBranding() } as never

/** An adapter configured with its own Redirect URI, the way the admin form
 *  sets it. `redirect` null means its authorize URL carries none. */
function adapterWith(redirect: string | null) {
  return {
    getAuthUrl: vi.fn((state: string) => {
      const u = new URL('https://provider.example/oauth/authorize')
      u.searchParams.set('state', state)
      if (redirect !== null) u.searchParams.set('redirect_uri', redirect)
      return u.toString()
    }),
    exchangeCode: vi.fn(async () => ({ accessToken: 'tok' })),
    refreshCredentials: async (c: unknown) => c,
  }
}

const adapters: Record<string, ReturnType<typeof adapterWith>> = {}
const registry = { get: (_v: string, slug: string) => adapters[slug] ?? null } as never

const PLATFORMS = [
  { vertical: 'crm', slug: 'secure', name: 'Secure', auth_type: 'oauth2' },
  { vertical: 'crm', slug: 'plain', name: 'Plain', auth_type: 'oauth2' },
  { vertical: 'crm', slug: 'bare', name: 'Bare', auth_type: 'oauth2' },
] as never

beforeEach(() => {
  vi.stubEnv('PUBLIC_BASE_URL', PUBLIC_BASE)
  adapters['secure'] = adapterWith(HTTPS_CALLBACK)
  adapters['plain'] = adapterWith(HTTP_CALLBACK)
  adapters['bare'] = adapterWith(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('redirectUriIn', () => {
  it('reads the redirect_uri an authorize URL carries, decoded', () => {
    expect(
      redirectUriIn(`https://p.example/a?redirect_uri=${encodeURIComponent(HTTPS_CALLBACK)}`),
    ).toBe(HTTPS_CALLBACK)
  })

  it('returns null when there is none, or it is empty, or the URL does not parse', () => {
    expect(redirectUriIn('https://p.example/a?state=s')).toBeNull()
    expect(redirectUriIn('https://p.example/a?redirect_uri=')).toBeNull()
    expect(redirectUriIn('not a url')).toBeNull()
  })
})

describe('Connect Link oauth-start records the redirect_uri it sent', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let sessions: ConnectSessionStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    handle = await openDb({ sqlitePath: ':memory:' })
    sessions = await ConnectSessionStore.create(handle)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectRouter({
        store: credentials,
        registry,
        sessions,
        endUsers,
        hostInfo,
        platforms: PLATFORMS,
      }),
    )
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    handle.close()
  })

  async function start(platform: string) {
    const s = await sessions.create({ tenantId: 't', label: 'l' })
    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${s.token}/oauth-start`,
      payload: { vertical: 'crm', platform },
    })
    expect(res.statusCode).toBe(200)
    const state = new URL(res.json().data.redirectUrl as string).searchParams.get('state')!
    return consumePendingState(state)
  }

  it('keeps an https adapter on https while PUBLIC_BASE_URL is http', async () => {
    expect((await start('secure'))?.redirectUri).toBe(HTTPS_CALLBACK)
  })

  it('keeps an http adapter on http alongside it', async () => {
    expect((await start('plain'))?.redirectUri).toBe(HTTP_CALLBACK)
  })

  it('falls back to the derived callback when the authorize URL carries none', async () => {
    expect((await start('bare'))?.redirectUri).toBe(`${PUBLIC_BASE}/auth/crm/bare/callback`)
  })
})

describe('direct start + callback exchanges with the redirect_uri it sent', () => {
  let handle: DbHandle
  let fastify: FastifyInstance

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    const credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(createUnifiedAuthRouter({ store: credentials, registry }))
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    handle.close()
  })

  async function connectAndCallBack(platform: string, query = '') {
    const startRes = await fastify.inject({
      method: 'GET',
      url: `/auth/crm/${platform}/connect${query}`,
    })
    expect(startRes.statusCode).toBe(302)
    const state = new URL(startRes.headers.location as string).searchParams.get('state')!
    const cb = await fastify.inject({
      method: 'GET',
      url: `/auth/crm/${platform}/callback?code=c&state=${state}`,
    })
    expect(cb.statusCode).toBe(201)
    return adapters[platform]!.exchangeCode
  }

  it('exchanges an https adapter on https and an http one on http, side by side', async () => {
    expect(await connectAndCallBack('secure')).toHaveBeenCalledWith('c', HTTPS_CALLBACK)
    expect(await connectAndCallBack('plain')).toHaveBeenCalledWith('c', HTTP_CALLBACK)
  })

  it('falls back to the derived callback when the authorize URL carries none', async () => {
    expect(await connectAndCallBack('bare')).toHaveBeenCalledWith(
      'c',
      `${PUBLIC_BASE}/auth/crm/bare/callback`,
    )
  })

  it('prefers what the provider was sent over a caller-supplied ?redirect_uri=', async () => {
    // The override passes validation (same origin, pinned path) but never
    // reaches the provider — getAuthUrl takes no redirect_uri — so replaying
    // it at exchange would mismatch the authorize request.
    const override = encodeURIComponent(`${PUBLIC_BASE}/auth/crm/secure/callback`)
    expect(await connectAndCallBack('secure', `?redirect_uri=${override}`)).toHaveBeenCalledWith(
      'c',
      HTTPS_CALLBACK,
    )
  })
})
