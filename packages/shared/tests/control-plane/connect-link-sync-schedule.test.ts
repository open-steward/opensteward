/**
 * A Connect Link decides the sync schedule of the connection it creates, and
 * "trigger only" means not even the sync that used to follow every OAuth
 * Connect Link.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { SyncStore } from '../../src/data-store/sync-store'
import { createConnectRouter } from '../../src/control-plane/connect-router'
import { createConnectAdminRouter } from '../../src/control-plane/connect-admin-router'
import { createUnifiedAuthRouter } from '../../src/control-plane/auth-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import type { HostBranding } from '../../src/control-plane/host-info'
import type { SyncSchedule } from '../../src/data-store/sync-schedule'

const SECRET = 'connect-link-sync-schedule-secret-must-be-32'

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

const oauth = {
  getAuthUrl: vi.fn((state: string) => `https://oauth.example/authorize?state=${state}`),
  exchangeCode: vi.fn(async () => ({ accessToken: 'tok' })),
  refreshCredentials: async (c: unknown) => c,
}
const apiKey = {
  exchangeCredentials: vi.fn(async () => ({ accessToken: 'key' })),
  refreshCredentials: async (c: unknown) => c,
}
const ADAPTERS: Record<string, unknown> = { oauthy: oauth, keyed: apiKey }
const PLATFORMS = [
  { vertical: 'ecommerce', slug: 'oauthy', name: 'OAuthy', auth_type: 'oauth2' },
  { vertical: 'ecommerce', slug: 'keyed', name: 'Keyed', auth_type: 'api_key' },
] as never

let handle: DbHandle
let fastify: FastifyInstance
let sessions: ConnectSessionStore
let store: CredentialStore
let syncStore: SyncStore
let endUsers: EndUserStore

beforeEach(async () => {
  resetRateLimitBuckets()
  handle = await openDb({ sqlitePath: ':memory:' })
  sessions = await ConnectSessionStore.create(handle)
  endUsers = await EndUserStore.create(handle, SECRET)
  store = await CredentialStore.create(handle, SECRET)
  syncStore = await SyncStore.create(handle)
  const registry = { get: (_v: string, slug: string) => ADAPTERS[slug] ?? null } as never
  fastify = Fastify({ logger: false })
  await fastify.register(
    createConnectRouter({ store, registry, sessions, endUsers, hostInfo, platforms: PLATFORMS }),
  )
  await fastify.register(
    createUnifiedAuthRouter({ store, registry, connectSessions: sessions, syncStore }),
  )
  await fastify.register(
    createConnectAdminRouter({
      store: {} as never,
      endUsers,
      sessions,
      getCompanyBaseUrl: () => 'https://oi.acme.example',
    }),
  )
  await fastify.ready()
})

afterEach(async () => {
  await fastify.close()
  await handle.close()
})

async function oauthConnect(link: { syncSchedule?: SyncSchedule | null; oneTimeOnly?: boolean }) {
  const s = await sessions.create({ tenantId: 't', label: 'l', ...link })
  const start = await fastify.inject({
    method: 'POST',
    url: `/connect/sessions/${s.token}/oauth-start`,
    payload: { vertical: 'ecommerce', platform: 'oauthy' },
  })
  expect(start.statusCode).toBe(200)
  const state = new URL(start.json().data.redirectUrl as string).searchParams.get('state')!
  const cb = await fastify.inject({
    method: 'GET',
    url: `/auth/ecommerce/oauthy/callback?code=c0de&state=${state}`,
  })
  expect(cb.statusCode).toBeLessThan(400)
  return (await sessions.getById(s.id))!.connectionId!
}

describe('ConnectSessionStore', () => {
  it('stores and reads back a link schedule', async () => {
    const custom = await sessions.create({
      tenantId: 't',
      label: 'l',
      syncSchedule: { mode: 'custom', intervalMinutes: 90 },
    })
    expect((await sessions.getById(custom.id))!.syncSchedule).toEqual({
      mode: 'custom',
      intervalMinutes: 90,
    })
    const none = await sessions.create({ tenantId: 't', label: 'l' })
    expect((await sessions.getById(none.id))!.syncSchedule).toBeNull()
  })

  it('reads a one-time link as once even when it was stored without a schedule', async () => {
    // The developer-API mint path stores one-time links with no schedule; the
    // row must still say what the connection it makes will be.
    const s = await sessions.create({ tenantId: 't', label: 'l', oneTimeOnly: true })
    expect((await sessions.getById(s.id))!.syncSchedule).toEqual({ mode: 'once' })
  })
})

describe('minting a link with a schedule', () => {
  const mint = (payload: Record<string, unknown>) =>
    fastify.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'default', label: 'Acme', ...payload },
    })

  it('stores the schedule it was given', async () => {
    const res = await mint({ syncSchedule: { mode: 'trigger_only' } })
    expect(res.statusCode).toBe(201)
    const id = res.json().data.id as string
    expect((await sessions.getById(id))!.syncSchedule).toEqual({ mode: 'trigger_only' })
  })

  it('refuses an invalid schedule', async () => {
    const res = await mint({ syncSchedule: { mode: 'custom', intervalMinutes: 5 } })
    expect(res.statusCode).toBe(400)
  })

  it('makes a one-time link once, and refuses any other mode with it', async () => {
    const ok = await mint({ oneTimeOnly: true })
    expect((await sessions.getById(ok.json().data.id))!.syncSchedule).toEqual({ mode: 'once' })
    const clash = await mint({ oneTimeOnly: true, syncSchedule: { mode: 'trigger_only' } })
    expect(clash.statusCode).toBe(400)
    expect(clash.json().error.code).toBe('SYNC_SCHEDULE_CONFLICT')
    // The caller asked for one-time themselves: no hint about the deployment default.
    expect(clash.json().error.message).not.toContain('by default')
  })

  it('refuses a conflicting mint before creating its customer', async () => {
    const email = 'new.customer@acme.example'
    const clash = await mint({
      oneTimeOnly: true,
      syncSchedule: { mode: 'trigger_only' },
      customerEmail: email,
    })
    expect(clash.statusCode).toBe(400)
    expect(clash.json().error.code).toBe('SYNC_SCHEDULE_CONFLICT')
    expect(await endUsers.findByEmail('default', email)).toBeNull()
    // Control: the same mint without the conflict does create the customer,
    // so the null above is the refusal's doing, not a lookup that cannot hit.
    const ok = await mint({
      oneTimeOnly: false,
      syncSchedule: { mode: 'trigger_only' },
      customerEmail: email,
    })
    expect(ok.statusCode).toBe(201)
    expect(await endUsers.findByEmail('default', email)).not.toBeNull()
  })
})

describe('a deployment that makes new links one-time by default', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    await app.register(
      createConnectAdminRouter({
        store: {} as never,
        endUsers,
        sessions,
        getCompanyBaseUrl: () => 'https://oi.acme.example',
        linkDefaults: () => ({ expiryHours: 72, oneTimeDefault: true }),
      }),
    )
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  const mint = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/admin/connect-sessions',
      payload: { tenantId: 'default', label: 'Acme', ...payload },
    })

  it('refuses a schedule left one-time by the default, and says how to choose one', async () => {
    const res = await mint({ syncSchedule: { mode: 'trigger_only' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('SYNC_SCHEDULE_CONFLICT')
    expect(res.json().error.message).toContain(
      'This deployment makes new links one-time by default; send oneTimeOnly: false to choose a sync schedule.',
    )
  })

  it('accepts the schedule once the caller sends oneTimeOnly: false', async () => {
    const res = await mint({ oneTimeOnly: false, syncSchedule: { mode: 'trigger_only' } })
    expect(res.statusCode).toBe(201)
    expect((await sessions.getById(res.json().data.id))!.syncSchedule).toEqual({
      mode: 'trigger_only',
    })
  })
})

describe('consuming a link', () => {
  it('a default link syncs right after the OAuth callback', async () => {
    const id = await oauthConnect({})
    expect((await store.getRow(id))!.syncMode).toBe('default')
    expect(await syncStore.list({ connectionId: id })).toEqual([
      expect.objectContaining({ origin: 'connect', status: 'pending' }),
    ])
  })

  it('a trigger-only link creates a trigger-only connection and does not sync it', async () => {
    const id = await oauthConnect({ syncSchedule: { mode: 'trigger_only' } })
    expect((await store.getRow(id))!.syncMode).toBe('trigger_only')
    expect(await syncStore.list({ connectionId: id })).toHaveLength(0)
  })

  it('a custom link passes its interval to the connection', async () => {
    const id = await oauthConnect({ syncSchedule: { mode: 'custom', intervalMinutes: 120 } })
    expect(await store.getRow(id)).toMatchObject({ syncMode: 'custom', syncIntervalMinutes: 120 })
  })

  it('a one-time link creates a once connection', async () => {
    const id = await oauthConnect({ oneTimeOnly: true })
    expect((await store.getRow(id))!.syncMode).toBe('once')
  })

  it('the credential form carries the link schedule too', async () => {
    const s = await sessions.create({
      tenantId: 't',
      label: 'l',
      syncSchedule: { mode: 'trigger_only' },
    })
    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${s.token}/credentials`,
      payload: { vertical: 'ecommerce', platform: 'keyed', fields: { apiKey: 'k' } },
    })
    expect(res.statusCode).toBe(201)
    const id = res.json().data.connectionId as string
    expect((await store.getRow(id))!.syncMode).toBe('trigger_only')
  })

  it('the credential form makes a one-time link a once connection', async () => {
    const s = await sessions.create({ tenantId: 't', label: 'l', oneTimeOnly: true })
    const res = await fastify.inject({
      method: 'POST',
      url: `/connect/sessions/${s.token}/credentials`,
      payload: { vertical: 'ecommerce', platform: 'keyed', fields: { apiKey: 'k' } },
    })
    expect(res.statusCode).toBe(201)
    const id = res.json().data.connectionId as string
    expect((await store.getRow(id))!.syncMode).toBe('once')
  })
})
