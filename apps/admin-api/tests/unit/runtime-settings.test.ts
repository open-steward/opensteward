/**
 * Per-key typed validation on PATCH /api/runtime-settings/{key}.
 *
 * The body schema is a Zod discriminated union (generated from
 * `RUNTIME_SETTINGS_SEEDS` in `runtime-settings-store.ts`), so a
 * `number`-typed seed like `rate_limit.api_key.per_minute` rejects a
 * string `value` at the spec level — no handler code runs. These tests
 * pin that behaviour AND the on-disk generated artifact (branch count
 * matches the seed inventory, file is committed).
 *
 * Dual-backend: SQLite (`:memory:`) always; Postgres when
 * TEST_DATABASE_URL is set. A fresh handle is opened per test; for
 * Postgres the public schema is dropped first so the shared db stays
 * isolated (SQLite ':memory:' is fresh per open).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore } from '../../src/core/db/identity-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createAuthRoutes } from '../../src/core/routes/auth'
import { createRuntimeSettingsRoutes } from '../../src/core/routes/runtime-settings'
import { UnifiedClient } from '../../src/core/proxy/client'
import {
  RUNTIME_SETTINGS_SEEDS,
  RuntimeSettingsStore,
} from '../../src/core/db/runtime-settings-store'
import {
  UPDATE_RUNTIME_SETTING_BRANCH_COUNT,
  UPDATE_RUNTIME_SETTING_BRANCHES,
  RUNTIME_SETTING_KEYS,
} from '../../src/core/routes/_runtime-settings-schema.generated'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('PATCH /api/runtime-settings/:key [$name]', (backend) => {
  let fastify: FastifyInstance
  let adminStore: AdminStore

  beforeEach(async () => {
    const handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    adminStore = await AdminStore.create(handle)
    const identityStore = await IdentityStore.create(
      handle,
      'test-store-secret-cccccccccccccccccccccccccccc',
    )
    const runtimeSettings = await RuntimeSettingsStore.create(handle)

    fastify = Fastify({ logger: false })
    await registerOpenApiBridge(fastify)
    // Mirror production: normalise timestamp fields to ISO 8601 before the
    // Zod response serializer runs (same hook as core/server.ts).
    fastify.addHook('preSerialization', async (request, reply, payload) =>
      isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
    )
    await fastify.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })

    fastify.decorate('authenticate', requireAuth)
    fastify.decorate('operatorOnly', requireRole('operator'))
    fastify.decorate('adminOnly', requireRole('admin'))

    // UnifiedClient points at a black-hole URL; the route only calls it
    // best-effort for cache invalidation, and the call is `void`-awaited
    // inside a try/catch — failures don't escape.
    const client = new UnifiedClient({ url: 'http://127.0.0.1:1' })

    await fastify.register(createAuthRoutes(adminStore, runtimeSettings))
    await fastify.register(
      createRuntimeSettingsRoutes(adminStore, client, identityStore, runtimeSettings),
    )

    await fastify.ready()
  })

  afterEach(async () => {
    await fastify?.close()
    // adminStore owns the shared handle; identityStore borrows it.
    await adminStore?.close()
  })

  async function setupAdmin(username = 'admin', password = 'SecurePass123!'): Promise<string> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username, password },
    })
    return JSON.parse(res.payload).token
  }

  // ── Number-typed setting ───────────────────────────────────────────────

  describe('number-typed setting (rate_limit.api_key.per_minute)', () => {
    const KEY = 'rate_limit.api_key.per_minute'

    it('400s when value is a string', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/runtime-settings/${KEY}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { key: KEY, value: 'not a number' },
      })
      expect(res.statusCode).toBe(400)
      // The fastify-zod-openapi error handler formats Zod issues as
      // `<instancePath>: <message>`. The discriminated-union check ends
      // up reporting an issue under the `value` field of the matched
      // branch — assert we surface the path so operators see "value"
      // in the error, not just "body".
      const body = JSON.parse(res.payload)
      const errorString = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
      expect(errorString.toLowerCase()).toContain('value')
      // Issues array preserves the raw Zod instancePath so SDKs can
      // pinpoint the failing field for richer UX.
      expect(Array.isArray(body.issues)).toBe(true)
      const paths = body.issues.map((issue: { instancePath?: string }) => issue.instancePath ?? '')
      expect(paths.some((p: string) => p.includes('value'))).toBe(true)
    })

    it('200s with a numeric value', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/runtime-settings/${KEY}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { key: KEY, value: 8080 },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.data.key).toBe(KEY)
      expect(body.data.value).toBe(8080)
      expect(body.data.valueType).toBe('number')
    })

    it('400s when body.key disagrees with path :key', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/runtime-settings/${KEY}`,
        headers: { authorization: `Bearer ${token}` },
        // body.key matches a real seed but is NOT the path key — the
        // handler must reject the mismatch.
        payload: { key: 'features.mcp_enabled', value: true },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // ── Boolean-typed setting ──────────────────────────────────────────────

  describe('boolean-typed setting (features.mcp_enabled)', () => {
    const KEY = 'features.mcp_enabled'

    it('400s when value is a string', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/runtime-settings/${KEY}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { key: KEY, value: 'true' },
      })
      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.payload)
      const paths = (body.issues ?? []).map(
        (issue: { instancePath?: string }) => issue.instancePath ?? '',
      )
      expect(paths.some((p: string) => p.includes('value'))).toBe(true)
    })

    it('200s with a boolean value', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/runtime-settings/${KEY}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { key: KEY, value: false },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.data.key).toBe(KEY)
      expect(body.data.value).toBe(false)
      expect(body.data.valueType).toBe('boolean')
    })
  })

  // ── Path param rejects unknown keys ────────────────────────────────────

  // ── Enum-typed setting ─────────────────────────────────────────────────

  describe('enum-typed setting (logos.source)', () => {
    const KEY = 'logos.source'

    it('400s on a value outside the enum', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'PATCH',
        url: `/api/runtime-settings/${KEY}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { key: KEY, value: 'cnd' },
      })
      // Without the enum this typo would be accepted and persisted, every
      // consumer would silently fall back to monogram tiles, and the only
      // evidence would be a warning in a container log.
      expect(res.statusCode).toBe(400)
    })

    it('200s for each legal mode', async () => {
      const token = await setupAdmin()
      for (const value of ['cdn', 'local', 'none']) {
        const res = await fastify.inject({
          method: 'PATCH',
          url: `/api/runtime-settings/${KEY}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { key: KEY, value },
        })
        expect(res.statusCode).toBe(200)
        expect(JSON.parse(res.payload).data.value).toBe(value)
      }
    })

    it('advertises the legal values so the UI can render a dropdown', async () => {
      const token = await setupAdmin()
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/runtime-settings',
        headers: { authorization: `Bearer ${token}` },
      })
      const rows = JSON.parse(res.payload).data as Array<{
        key: string
        enumValues: string[] | null
      }>
      expect(rows.find((r) => r.key === KEY)!.enumValues).toEqual(['none', 'cdn', 'local'])
      // A free-form string setting stays null rather than reporting [].
      expect(rows.find((r) => r.key === 'logos.brandfetch_client_id')!.enumValues).toBeNull()
    })
  })

  it('400s on unknown path :key (not in RUNTIME_SETTINGS_SEEDS)', async () => {
    const token = await setupAdmin()
    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/runtime-settings/totally.fake.key',
      headers: { authorization: `Bearer ${token}` },
      payload: { key: 'totally.fake.key', value: 1 },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ── Generated-file invariants ────────────────────────────────────────────
//
// These are independent of the Fastify harness — they pin the codegen
// output to its source so CI catches a stale generated file even if no
// runtime test happens to exercise the new branch.
describe('_runtime-settings-schema.generated.ts', () => {
  it('is committed to the repo', () => {
    const generatedPath = resolve(
      __dirname,
      '../../src/core/routes/_runtime-settings-schema.generated.ts',
    )
    expect(existsSync(generatedPath)).toBe(true)
    const contents = readFileSync(generatedPath, 'utf8')
    expect(contents).toContain('GENERATED FILE — DO NOT EDIT.')
    expect(contents).toContain('UpdateRuntimeSettingBody')
  })

  it('covers every RUNTIME_SETTINGS_SEEDS entry in exactly one branch, grouped by value shape', () => {
    // One branch per value shape, not per setting: the 29 settings share a
    // handful of shapes (number, boolean, string, json, and one closed
    // vocabulary), so that is the component count the spec carries.
    expect(UPDATE_RUNTIME_SETTING_BRANCH_COUNT).toBe(UPDATE_RUNTIME_SETTING_BRANCHES.length)
    expect(UPDATE_RUNTIME_SETTING_BRANCH_COUNT).toBeLessThan(RUNTIME_SETTINGS_SEEDS.length)
    const covered = UPDATE_RUNTIME_SETTING_BRANCHES.flatMap((b) => [...b.keys])
    expect([...covered].sort()).toEqual(RUNTIME_SETTINGS_SEEDS.map((s) => s.key).sort())
    for (const branch of UPDATE_RUNTIME_SETTING_BRANCHES) {
      const shapes = new Set(
        branch.keys.map((k) => RUNTIME_SETTINGS_SEEDS.find((s) => s.key === k)!.valueType),
      )
      expect(shapes.size).toBe(1)
    }
    expect(RUNTIME_SETTING_KEYS.length).toBe(RUNTIME_SETTINGS_SEEDS.length)
    // Order also matches — the codegen iterates the seed inventory once.
    for (let i = 0; i < RUNTIME_SETTINGS_SEEDS.length; i++) {
      expect(RUNTIME_SETTING_KEYS[i]).toBe(RUNTIME_SETTINGS_SEEDS[i]!.key)
    }
  })
})

describe('sync schedule settings', () => {
  it('seeds the deployment sync interval at 6 hours and the scheduler on', async () => {
    const { RUNTIME_SETTINGS_SEEDS } = await import('../../src/core/db/runtime-settings-store')
    const byKey = new Map(RUNTIME_SETTINGS_SEEDS.map((s) => [s.key, s]))
    expect(byKey.get('data_store.sync.default_interval_minutes')).toMatchObject({
      defaultValue: 360,
      valueType: 'number',
      category: 'data_store',
    })
    expect(byKey.get('data_store.sync.scheduler_enabled')).toMatchObject({
      defaultValue: true,
      valueType: 'boolean',
      category: 'data_store',
      warnOn: 'disable',
    })
  })
})
