/**
 * Per-customer OAuth inputs on the Connect Link flow.
 *
 * Shopify's authorize URL is `https://{shop}.myshopify.com/…`. Before this,
 * `POST /connect/sessions/:token/oauth-start` had nowhere to take a shop from
 * and the adapter threw `Cannot read properties of undefined (reading
 * 'endsWith')` — a 500 on a page the operator has already sent to a customer.
 *
 * The contract pinned here: an adapter that declares `oauthFields()` gets them
 * on its catalog entry, gets a named 400 when a required one is missing, gets
 * the filtered values on `getAuthUrl`, and finds them again in pending state
 * for the callback. An adapter that declares none is byte-for-byte untouched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { consumePendingState } from '../../src/auth/oauth'
import { createConnectRouter } from '../../src/control-plane/connect-router'
import { createUnifiedAuthRouter } from '../../src/control-plane/auth-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import type { HostBranding } from '../../src/control-plane/host-info'

const SECRET = 'connect-oauth-inputs-secret-must-be-32ch'

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

const SHOP_FIELDS = [{ name: 'shop', label: 'Shopify store', type: 'text' as const, required: true }]

const shopAdapter = {
  oauthFields: () => SHOP_FIELDS,
  getAuthUrl: vi.fn(
    (state: string, _scopes?: string[], _challenge?: string, inputs?: Record<string, string>) =>
      `https://${inputs?.shop}.myshopify.com/admin/oauth/authorize?state=${state}`,
  ),
}
const plainAdapter = {
  getAuthUrl: vi.fn((state: string) => `https://plain.example/authorize?state=${state}`),
}

const PLATFORMS = [
  { vertical: 'ecommerce', slug: 'shopify', name: 'Shopify', auth_type: 'oauth2' },
  { vertical: 'ecommerce', slug: 'plain', name: 'Plain', auth_type: 'oauth2' },
] as never

describe('Connect Link oauthFields', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let sessions: ConnectSessionStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    shopAdapter.getAuthUrl.mockClear()
    plainAdapter.getAuthUrl.mockClear()
    handle = await openDb({ sqlitePath: ':memory:' })
    sessions = await ConnectSessionStore.create(handle)
    const endUsers = await EndUserStore.create(handle, SECRET)
    const credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectRouter({
        store: credentials,
        registry: {
          get: (_v: string, slug: string) =>
            slug === 'shopify' ? shopAdapter : slug === 'plain' ? plainAdapter : null,
        } as never,
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

  it('exposes oauthFields on the catalog entry, and only there', async () => {
    const s = await sessions.create({ tenantId: 't', label: 'l' })
    const res = await fastify.inject({ method: 'GET', url: `/connect/sessions/${s.token}` })
    expect(res.statusCode).toBe(200)
    const catalog = res.json().data.catalog as Array<{ slug: string; oauthFields?: unknown }>
    expect(catalog.find((c) => c.slug === 'shopify')?.oauthFields).toEqual(SHOP_FIELDS)
    expect(catalog.find((c) => c.slug === 'plain')?.oauthFields).toBeUndefined()
  })

  it('400s naming the missing required inputs instead of reaching the adapter', async () => {
    const s = await sessions.create({ tenantId: 't', label: 'l' })
    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${s.token}/oauth-start`,
      payload: { vertical: 'ecommerce', platform: 'shopify' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatchObject({ code: 'MISSING_OAUTH_FIELDS', fields: ['shop'] })
    expect(shopAdapter.getAuthUrl).not.toHaveBeenCalled()
  })

  it('hands the filtered inputs to getAuthUrl and parks them in pending state', async () => {
    const s = await sessions.create({ tenantId: 't', label: 'l' })
    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${s.token}/oauth-start`,
      payload: { vertical: 'ecommerce', platform: 'shopify', fields: { shop: ' acme ', evil: 'x' } },
    })
    expect(res.statusCode).toBe(200)
    const url = new URL(res.json().data.redirectUrl as string)
    expect(url.host).toBe('acme.myshopify.com')
    const pending = consumePendingState(url.searchParams.get('state')!)
    expect(pending?.inputs).toEqual({ shop: 'acme' })
  })

  it('leaves adapters without oauthFields byte-for-byte untouched', async () => {
    const s = await sessions.create({ tenantId: 't', label: 'l' })
    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${s.token}/oauth-start`,
      payload: { vertical: 'ecommerce', platform: 'plain', fields: { shop: 'ignored' } },
    })
    expect(res.statusCode).toBe(200)
    const state = new URL(res.json().data.redirectUrl as string).searchParams.get('state')!
    expect(consumePendingState(state)?.inputs).toBeNull()
    expect(plainAdapter.getAuthUrl).toHaveBeenLastCalledWith(state, undefined, undefined, undefined)
  })
})

describe('direct start + callback with oauthFields', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let credentials: CredentialStore

  const exchanging = {
    platform: 'shopify',
    oauthFields: () => SHOP_FIELDS,
    getAuthUrl: (
      state: string,
      _scopes?: string[],
      _challenge?: string,
      inputs?: Record<string, string>,
    ) => `https://${inputs?.shop}.myshopify.com/authorize?state=${state}`,
    exchangeCode: vi.fn(async () => ({ accessToken: 'plain-exchange' })),
    exchangeCodeWithInputs: vi.fn(
      async (_code: string, _uri: string, inputs: Record<string, string>) => ({
        accessToken: 'tok',
        extra: { shop: inputs.shop.toLowerCase() },
      }),
    ),
    refreshCredentials: async (c: unknown) => c,
  }

  beforeEach(async () => {
    exchanging.exchangeCode.mockClear()
    exchanging.exchangeCodeWithInputs.mockClear()
    handle = await openDb({ sqlitePath: ':memory:' })
    credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createUnifiedAuthRouter({
        store: credentials,
        registry: { get: () => exchanging } as never,
      }),
    )
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    handle.close()
  })

  it('reads declared inputs from the query string and 400s without them', async () => {
    const bad = await fastify.inject({ method: 'GET', url: '/auth/ecommerce/shopify/connect' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error).toMatchObject({ code: 'MISSING_OAUTH_FIELDS', fields: ['shop'] })

    const ok = await fastify.inject({
      method: 'GET',
      url: '/auth/ecommerce/shopify/connect?shop=ACME',
    })
    expect(ok.statusCode).toBe(302)
    expect(new URL(ok.headers.location as string).host).toBe('acme.myshopify.com')
  })

  it('prefers exchangeCodeWithInputs and persists the inputs under credentials.extra', async () => {
    const start = await fastify.inject({
      method: 'GET',
      url: '/auth/ecommerce/shopify/connect?shop=ACME',
    })
    const state = new URL(start.headers.location as string).searchParams.get('state')!
    const cb = await fastify.inject({
      method: 'GET',
      url: `/auth/ecommerce/shopify/callback?code=c&state=${state}`,
    })
    expect(cb.statusCode).toBe(201)
    expect(exchanging.exchangeCodeWithInputs).toHaveBeenCalledWith(
      'c',
      expect.any(String),
      { shop: 'ACME' },
      null,
    )
    expect(exchanging.exchangeCode).not.toHaveBeenCalled()
    const saved = await credentials.loadById(cb.json().data.id as string)
    // The adapter's normalised value wins over the raw input.
    expect(saved?.extra).toEqual({ shop: 'acme' })
  })
})
