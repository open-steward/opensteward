/**
 * Server-side enforcement of the "unsupported" platform status: listed and
 * viewable, never connectable. Every choke point that could create a NEW
 * connection or ENABLE a platform must refuse with the shared
 * `PLATFORM_UNSUPPORTED` body before it ever reaches the adapter — and must
 * refuse even when the registry already has the adapter enabled, since an
 * operator can mark a platform unsupported after having enabled it.
 *
 * What must keep working regardless: an OAuth callback for a flow already in
 * flight (the customer already consented at the provider — refusing here
 * would stall a grant with no way to retry) and everything about a supported
 * platform.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { AdapterSettingsStore } from '../../src/adapter/settings-store'
import { generateState, storePendingState } from '../../src/auth/oauth'
import { createConnectRouter } from '../../src/control-plane/connect-router'
import { createUnifiedAuthRouter } from '../../src/control-plane/auth-router'
import { createUnifiedAdminPlatformsRouter } from '../../src/control-plane/admin-platforms-router'
import { createUnifiedPlatformsRouter } from '../../src/control-plane/platforms-router'
import type { PlatformEntry } from '../../src/control-plane/platforms-router'
import { unsupportedIndex } from '../../src/reference/platform-status'
import type { UnsupportedPlatform } from '../../src/reference/platform-status'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import type { HostBranding } from '../../src/control-plane/host-info'

const SECRET = 'unsupported-platform-refusal-secret-32ch'

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

const LEGACY_ISSUE = 'https://github.com/open-steward/opensteward/issues/1'

const PLATFORMS: PlatformEntry[] = [
  { vertical: 'ecommerce', slug: 'good-oauth', name: 'Good Oauth', auth_type: 'oauth2' },
  {
    vertical: 'ecommerce',
    slug: 'legacy-oauth',
    name: 'Legacy Oauth',
    auth_type: 'oauth2',
    unsupported: { reason: 'API retired, no successor', issueUrl: LEGACY_ISSUE },
  },
  { vertical: 'ecommerce', slug: 'good-key', name: 'Good Key', auth_type: 'api_key' },
  {
    vertical: 'ecommerce',
    slug: 'legacy-key',
    name: 'Legacy Key',
    auth_type: 'api_key',
    unsupported: { reason: 'No public API' },
  },
]

const goodOauthAdapter = {
  getAuthUrl: vi.fn((state: string) => `https://good.example/authorize?state=${state}`),
  exchangeCode: vi.fn(async () => ({ accessToken: 'good-oauth-token' })),
}
const legacyOauthAdapter = {
  getAuthUrl: vi.fn((state: string) => `https://legacy.example/authorize?state=${state}`),
  exchangeCode: vi.fn(async () => ({ accessToken: 'legacy-oauth-token' })),
}
const goodKeyAdapter = {
  credentialFields: () => [{ name: 'apiKey', label: 'API key', type: 'text' as const }],
  exchangeCredentials: vi.fn(async (fields: Record<string, string>) => ({
    apiKey: fields['apiKey'],
  })),
}
const legacyKeyAdapter = {
  credentialFields: () => [{ name: 'apiKey', label: 'API key', type: 'text' as const }],
  exchangeCredentials: vi.fn(async (fields: Record<string, string>) => ({
    apiKey: fields['apiKey'],
  })),
}

const ADAPTERS: Record<string, unknown> = {
  'good-oauth': goodOauthAdapter,
  'legacy-oauth': legacyOauthAdapter,
  'good-key': goodKeyAdapter,
  'legacy-key': legacyKeyAdapter,
}

// Metadata says these are enabled/known regardless — mirrors an operator
// having enabled a platform before it was later marked unsupported.
const enableSpy = vi.fn((_vertical: string, slug: string) => ADAPTERS[slug])
const disableSpy = vi.fn(() => true)
const setConfigSpy = vi.fn()
const registry = {
  get: (_vertical: string, slug: string) => ADAPTERS[slug],
  knownSlugsByVertical: () => ({ ecommerce: Object.keys(ADAPTERS) }),
  enable: enableSpy,
  disable: disableSpy,
  setConfig: setConfigSpy,
} as never

const unsupportedByKey = unsupportedIndex(PLATFORMS)
const namesByKey = new Map<string, string>()
for (const p of PLATFORMS) namesByKey.set(`${p.vertical}:${p.slug}`, p.name)
function getUnsupported(
  vertical: string,
  slug: string,
): (UnsupportedPlatform & { name?: string }) | undefined {
  const info = unsupportedByKey.get(`${vertical}:${slug}`)
  if (!info) return undefined
  return { ...info, name: namesByKey.get(`${vertical}:${slug}`) }
}

describe('unsupported platform refusal', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let sessions: ConnectSessionStore
  let credentials: CredentialStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    for (const fn of [
      goodOauthAdapter.getAuthUrl,
      goodOauthAdapter.exchangeCode,
      legacyOauthAdapter.getAuthUrl,
      legacyOauthAdapter.exchangeCode,
      goodKeyAdapter.exchangeCredentials,
      legacyKeyAdapter.exchangeCredentials,
      enableSpy,
      disableSpy,
      setConfigSpy,
    ]) {
      fn.mockClear()
    }
    handle = await openDb({ sqlitePath: ':memory:' })
    sessions = await ConnectSessionStore.create(handle)
    const endUsers = await EndUserStore.create(handle, SECRET)
    credentials = await CredentialStore.create(handle, SECRET)
    const settingsStore = await AdapterSettingsStore.create(handle, SECRET)

    fastify = Fastify({ logger: false })
    await fastify.register(createUnifiedPlatformsRouter({ platforms: PLATFORMS, settingsStore }))
    await fastify.register(
      createUnifiedAdminPlatformsRouter({ registry, settingsStore, getUnsupported }),
    )
    await fastify.register(
      createUnifiedAuthRouter({ store: credentials, registry, getUnsupported }),
    )
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

  describe('GET /v1/platforms', () => {
    it('carries `unsupported` on the flat list and the single-platform route', async () => {
      const list = await fastify.inject({ method: 'GET', url: '/v1/platforms' })
      expect(list.statusCode).toBe(200)
      const rows = list.json().data as Array<{ slug: string; unsupported?: UnsupportedPlatform }>
      const legacy = rows.find((r) => r.slug === 'legacy-oauth')
      expect(legacy?.unsupported).toEqual({ reason: 'API retired, no successor', issueUrl: LEGACY_ISSUE })
      const good = rows.find((r) => r.slug === 'good-oauth')
      expect(good?.unsupported).toBeUndefined()

      const single = await fastify.inject({
        method: 'GET',
        url: '/v1/platforms/ecommerce/legacy-key',
      })
      expect(single.statusCode).toBe(200)
      expect(single.json().data.unsupported).toEqual({ reason: 'No public API' })
    })
  })

  describe('Connect Link catalog', () => {
    it('omits an unsupported platform even though the registry has it enabled; keeps supported ones', async () => {
      const s = await sessions.create({ tenantId: 't1', label: 'l' })
      const res = await fastify.inject({ method: 'GET', url: `/connect/sessions/${s.token}` })
      expect(res.statusCode).toBe(200)
      const catalog = res.json().data.catalog as Array<{ slug: string }>
      const slugs = catalog.map((c) => c.slug)
      expect(slugs).toContain('good-oauth')
      expect(slugs).toContain('good-key')
      expect(slugs).not.toContain('legacy-oauth')
      expect(slugs).not.toContain('legacy-key')
    })
  })

  describe('POST /connect/sessions/:token/oauth-start', () => {
    it('refuses an unsupported platform with reason + issueUrl and never calls getAuthUrl', async () => {
      const s = await sessions.create({ tenantId: 't1', label: 'l' })
      const res = await fastify.inject({
        method: 'POST',
        url: `/connect/sessions/${s.token}/oauth-start`,
        payload: { vertical: 'ecommerce', platform: 'legacy-oauth' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toEqual({
        code: 'PLATFORM_UNSUPPORTED',
        message: 'Legacy Oauth is not supported: API retired, no successor',
        reason: 'API retired, no successor',
        issueUrl: LEGACY_ISSUE,
      })
      expect(legacyOauthAdapter.getAuthUrl).not.toHaveBeenCalled()
    })

    it('leaves a supported platform unaffected', async () => {
      const s = await sessions.create({ tenantId: 't1', label: 'l' })
      const res = await fastify.inject({
        method: 'POST',
        url: `/connect/sessions/${s.token}/oauth-start`,
        payload: { vertical: 'ecommerce', platform: 'good-oauth' },
      })
      expect(res.statusCode).toBe(200)
      expect(goodOauthAdapter.getAuthUrl).toHaveBeenCalled()
    })
  })

  describe('POST /connect/sessions/:token/credentials', () => {
    it('refuses an unsupported platform and never calls exchangeCredentials', async () => {
      const s = await sessions.create({ tenantId: 't1', label: 'l' })
      const res = await fastify.inject({
        method: 'POST',
        url: `/connect/sessions/${s.token}/credentials`,
        payload: { vertical: 'ecommerce', platform: 'legacy-key', fields: { apiKey: 'x' } },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toEqual({
        code: 'PLATFORM_UNSUPPORTED',
        message: 'Legacy Key is not supported: No public API',
        reason: 'No public API',
      })
      expect(legacyKeyAdapter.exchangeCredentials).not.toHaveBeenCalled()
    })

    it('leaves a supported platform unaffected', async () => {
      const s = await sessions.create({ tenantId: 't1', label: 'l' })
      const res = await fastify.inject({
        method: 'POST',
        url: `/connect/sessions/${s.token}/credentials`,
        payload: { vertical: 'ecommerce', platform: 'good-key', fields: { apiKey: 'x' } },
      })
      expect(res.statusCode).toBe(201)
      expect(goodKeyAdapter.exchangeCredentials).toHaveBeenCalled()
    })
  })

  describe('GET /auth/:vertical/:platform/connect (direct)', () => {
    it('refuses an unsupported platform before resolving the adapter', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/auth/ecommerce/legacy-oauth/connect',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toEqual({
        code: 'PLATFORM_UNSUPPORTED',
        message: 'Legacy Oauth is not supported: API retired, no successor',
        reason: 'API retired, no successor',
        issueUrl: LEGACY_ISSUE,
      })
      expect(legacyOauthAdapter.getAuthUrl).not.toHaveBeenCalled()
    })

    it('leaves a supported platform unaffected', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/auth/ecommerce/good-oauth/connect' })
      expect(res.statusCode).toBe(302)
      expect(goodOauthAdapter.getAuthUrl).toHaveBeenCalled()
    })
  })

  describe('POST /auth/:vertical/:platform/connect (direct)', () => {
    it('refuses an unsupported platform and never calls exchangeCredentials', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/auth/ecommerce/legacy-key/connect',
        payload: { fields: { apiKey: 'x' } },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toEqual({
        code: 'PLATFORM_UNSUPPORTED',
        message: 'Legacy Key is not supported: No public API',
        reason: 'No public API',
      })
      expect(legacyKeyAdapter.exchangeCredentials).not.toHaveBeenCalled()
    })

    it('leaves a supported platform unaffected', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/auth/ecommerce/good-key/connect',
        payload: { fields: { apiKey: 'x' } },
      })
      expect(res.statusCode).toBe(200)
      expect(goodKeyAdapter.exchangeCredentials).toHaveBeenCalled()
    })
  })

  describe('OAuth callback', () => {
    it('still completes a pending state for a platform that is unsupported today', async () => {
      // Simulates a flow started while the platform was still supported (or
      // started via an admin path that predates the metadata change) — the
      // customer has already granted consent upstream, so the callback must
      // not be the place this gets refused.
      const state = generateState()
      storePendingState(state, 'legacy-oauth', {
        vertical: 'ecommerce',
        label: null,
        tenantId: 't1',
        redirectUri: 'http://example.test/auth/ecommerce/legacy-oauth/callback',
        codeVerifier: null,
        inputs: null,
      })
      const res = await fastify.inject({
        method: 'GET',
        url: `/auth/ecommerce/legacy-oauth/callback?code=abc&state=${state}`,
      })
      expect(res.statusCode).toBe(201)
      expect(legacyOauthAdapter.exchangeCode).toHaveBeenCalledWith(
        'abc',
        'http://example.test/auth/ecommerce/legacy-oauth/callback',
      )
    })
  })

  describe('POST /admin/platforms/:vertical/:slug/enable', () => {
    it('refuses an unsupported platform and never calls registry.enable', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/admin/platforms/ecommerce/legacy-oauth/enable',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toEqual({
        code: 'PLATFORM_UNSUPPORTED',
        message: 'Legacy Oauth is not supported: API retired, no successor',
        reason: 'API retired, no successor',
        issueUrl: LEGACY_ISSUE,
      })
      expect(enableSpy).not.toHaveBeenCalled()
    })

    it('leaves enabling a supported platform unaffected', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/admin/platforms/ecommerce/good-oauth/enable',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })
      expect(enableSpy).toHaveBeenCalledWith('ecommerce', 'good-oauth', undefined)
    })

    it('still allows disabling an unsupported (already-enabled) platform', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/admin/platforms/ecommerce/legacy-oauth/disable',
      })
      expect(res.statusCode).toBe(200)
      expect(disableSpy).toHaveBeenCalledWith('ecommerce', 'legacy-oauth')
    })
  })

  describe('GET /admin/platforms', () => {
    it('rows carry `unsupported` when set, and omit it otherwise', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/admin/platforms?vertical=ecommerce' })
      expect(res.statusCode).toBe(200)
      const rows = res.json().data as Array<{
        slug: string
        enabled: boolean
        hasConfig: boolean
        unsupported?: UnsupportedPlatform
      }>
      const legacy = rows.find((r) => r.slug === 'legacy-oauth')
      expect(legacy?.unsupported).toEqual({ reason: 'API retired, no successor', issueUrl: LEGACY_ISSUE })
      // Other row fields are untouched by the new field.
      expect(legacy).toMatchObject({ vertical: 'ecommerce', slug: 'legacy-oauth' })
      expect(typeof legacy?.enabled).toBe('boolean')
      expect(typeof legacy?.hasConfig).toBe('boolean')

      const good = rows.find((r) => r.slug === 'good-oauth')
      expect(good?.unsupported).toBeUndefined()
    })
  })
})
