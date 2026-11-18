/**
 * Part A hardening: `GET /api/audit`'s `page`/`limit` query params have no
 * numeric Zod schema (just `z.string().optional()`), so a hand-edited URL
 * reaches `parseInt`/`Math.min` unchecked. Reconnaissance reproduced three
 * defects empirically against this exact route:
 *
 *   A3 — `?limit=-1` compiles to `LIMIT -1`, which SQLite reads as UNLIMITED,
 *        bypassing the documented 200-row cap.
 *   A4 — `?page=abc` parses to `NaN`, which reaches Kysely's `.offset()` and
 *        throws `SqliteError: datatype mismatch` (a 500).
 *   A5 — `?page=0` / `?page=-3` compile to a negative `OFFSET`, which SQLite
 *        silently reads as 0 (page one renders) while `meta.page` echoes the
 *        bogus value back to the caller.
 *
 * Each test below reproduces the defect's *symptom* against a seeded table
 * large enough to make the difference observable (unbounded vs. capped;
 * NaN vs. clamped-to-1), so a regression back to the unclamped parse fails
 * these on row counts / meta, not just on status code.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createAuthRoutes } from '../../src/core/routes/auth'
import { createAuditRoutes } from '../../src/core/routes/audit'

describe('GET /api/audit pagination clamps', () => {
  let dir: string
  let fastify: FastifyInstance
  let adminStore: AdminStore
  let token: string

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-audit-clamp-'))
    const handle = await openDb({ sqlitePath: join(dir, 'admin.db') })
    adminStore = await AdminStore.create(handle)
    const runtimeSettings = await RuntimeSettingsStore.create(handle)

    fastify = Fastify({ logger: false })
    await registerOpenApiBridge(fastify)
    fastify.addHook('preSerialization', async (request, reply, payload) =>
      isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
    )
    await fastify.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
    fastify.decorate('authenticate', requireAuth)
    fastify.decorate('operatorOnly', requireRole('operator'))
    fastify.decorate('adminOnly', requireRole('admin'))
    await fastify.register(createAuthRoutes(adminStore, runtimeSettings))
    await fastify.register(createAuditRoutes(adminStore))
    await fastify.ready()

    const setupRes = await fastify.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'olivia', password: 'SecurePass123!' },
    })
    token = JSON.parse(setupRes.payload).token

    // 55 rows: more than the 50-row default, so a bypass of the cap (A3) or
    // an accidental widening is observable as a row-count difference, not
    // just a status code.
    for (let i = 0; i < 55; i++) {
      await adminStore.writeAudit('olivia-id', 'api_key.mint', undefined, `key-${i}`)
    }
  })

  afterEach(async () => {
    await fastify?.close()
    await adminStore?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  // A3
  it('?limit=-1 falls back to the default instead of compiling to LIMIT -1 (unlimited)', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/audit?limit=-1',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    // The setup flow itself writes one audit row, so 56 rows exist — well
    // over 50. `LIMIT -1` unpatched returns all of them; the fix returns
    // exactly the documented default.
    expect(body.data).toHaveLength(50)
    expect(body.meta.limit).toBe(50)
  })

  // A4
  it('?page=abc does not 500 (SqliteError: datatype mismatch) and falls back to page 1', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/audit?page=abc',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.meta.page).toBe(1)
    expect(body.data).toHaveLength(50)
  })

  // A5
  it.each(['0', '-3'])(
    '?page=%s renders page one and reports meta.page=1, not the raw value',
    async (rawPage) => {
      const res = await fastify.inject({
        method: 'GET',
        url: `/api/audit?page=${rawPage}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.meta.page).toBe(1)

      const page1 = await fastify.inject({
        method: 'GET',
        url: '/api/audit?page=1',
        headers: { authorization: `Bearer ${token}` },
      })
      // Same rows as an explicit, well-formed `?page=1` — not an
      // OFFSET-goes-negative page shifted by the raw (bogus) value.
      expect(JSON.parse(page1.payload).data).toEqual(body.data)
    },
  )

  /**
   * The 200 ceiling itself, which nothing pinned: removing `Math.min(…, 200)`
   * from the route left all 781 admin-api tests green.
   *
   * It is the ONLY ceiling on this path — `AdminStore.listAudit` deliberately
   * has none of its own (its clamp only rejects non-positive and non-integer
   * values, then honours whatever it is given, because a caller bypassing the
   * route has made no promise about which default applies). So an unclamped
   * route means `?limit=100000` really does return 100,000 rows.
   *
   * 205 rows are seeded on top of the 56 the outer fixture leaves, so "the
   * ceiling held" (200) is distinguishable from "everything came back" (261)
   * AND from the 50-row default — three different numbers, none of which the
   * broken path returns.
   */
  it('caps limit at 200 however large a value is asked for', async () => {
    for (let i = 0; i < 205; i++) {
      await adminStore.writeAudit('olivia-id', 'api_key.mint', undefined, `extra-${i}`)
    }
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/audit?limit=100000',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.data).toHaveLength(200)
    expect(body.meta.limit).toBe(200)
    // And the total still speaks for the whole log, not the capped page.
    expect(body.meta.total).toBeGreaterThan(200)
  })

  it('a well-formed page/limit is untouched', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/audit?page=2&limit=20',
      headers: { authorization: `Bearer ${token}` },
    })
    const body = JSON.parse(res.payload)
    expect(body.meta.page).toBe(2)
    expect(body.meta.limit).toBe(20)
    expect(body.data).toHaveLength(20)
  })
})
