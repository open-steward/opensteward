/**
 * End-to-end coverage for the lockout integration on POST /api/auth/login.
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
import { createAuthRoutes } from '../../src/core/routes/auth'
import { LoginLockout } from '../../src/core/auth/lockout'
import { createUser } from '../../src/core/auth/users'
import { requireAuth } from '../../src/core/auth/jwt-auth'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'

describe('POST /api/auth/login — lockout', () => {
  let dir: string
  let dbPath: string
  let fastify: FastifyInstance
  let store: AdminStore
  // `onLockout` is a synchronous `() => void` callback, but `writeAudit` is now
  // async. Mirror production (`void store.writeAudit(...)`) and stash each
  // in-flight promise so the audit assertion can flush the fire-and-forget
  // write before reading the log.
  let pendingAudits: Promise<void>[]
  // Password verification is deliberately slow (bcrypt), so four real logins
  // can span more than the 1s window on a loaded machine — the earliest
  // failures then age out before the threshold is reached and the route keeps
  // answering 401. Drive the lockout from a clock the test holds still so the
  // assertions don't depend on how fast the box is.
  let clock: number

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'admin-api-lockout-'))
    dbPath = join(dir, 'admin.db')
    pendingAudits = []
    clock = 1_700_000_000_000
    const handle = await openDb({ sqlitePath: dbPath })
    store = await AdminStore.create(handle)
    const runtimeSettings = await RuntimeSettingsStore.create(handle)
    await createUser(store, 'alice', 'SecurePass123!', 'admin')

    fastify = Fastify({ logger: false })
    await registerOpenApiBridge(fastify)
    await fastify.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
    fastify.decorate('authenticate', requireAuth)

    const lockout = new LoginLockout({
      config: { windowMs: 1_000, thresholdShort: 3, thresholdHard: 6, lockoutMs: 60_000 },
      now: () => clock,
      onLockout: (event) => {
        pendingAudits.push(
          store.writeAudit('system', `user.lockout.${event.kind}`, undefined, event.username, {
            failures: event.failures,
          }),
        )
      },
    })
    await fastify.register(createAuthRoutes(store, runtimeSettings, { lockout }))
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify?.close()
    // Closes the shared handle for this store.
    await store?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function attemptLogin(password: string) {
    return fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password },
    })
  }

  it('returns 429 with Retry-After after threshold failures', async () => {
    for (let i = 0; i < 3; i++) await attemptLogin('wrong')
    const res = await attemptLogin('wrong')
    expect(res.statusCode).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
  })

  it('locks out even with the correct password after threshold hit', async () => {
    for (let i = 0; i < 3; i++) await attemptLogin('wrong')
    const res = await attemptLogin('SecurePass123!')
    expect(res.statusCode).toBe(429)
  })

  it('successful login before threshold clears failure state', async () => {
    await attemptLogin('wrong')
    await attemptLogin('wrong')
    const ok = await attemptLogin('SecurePass123!')
    expect(ok.statusCode).toBe(200)
    // Now we should have a fresh budget — two more wrongs ok
    expect((await attemptLogin('wrong')).statusCode).toBe(401)
    expect((await attemptLogin('wrong')).statusCode).toBe(401)
    expect((await attemptLogin('wrong')).statusCode).toBe(401)
    expect((await attemptLogin('wrong')).statusCode).toBe(429)
  })

  it('records a `user.lockout.temporary` audit event on lockout', async () => {
    for (let i = 0; i < 4; i++) await attemptLogin('wrong')
    // `onLockout` writes the audit row fire-and-forget; flush the in-flight
    // promise(s) so the row is committed before we read the log.
    await Promise.all(pendingAudits)
    const audit = await store.listAudit(20)
    expect(audit.some((e) => e.action === 'user.lockout.temporary')).toBe(true)
  })
})
