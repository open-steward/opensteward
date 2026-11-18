import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUnifiedAuthMiddleware } from '../../src/control-plane/auth-middleware'
import { createUnifiedEndUserAuthMiddleware } from '../../src/control-plane/end-user-auth-middleware'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'
import type { ConnectionWriteGuard } from '../../src/control-plane/vertical-scopes'

/**
 * The per-connection write gate (P6): a write on a connection beyond the license
 * limit is refused in BOTH auth middlewares, the admin secret included. Reads
 * and the read-safe POST /sync are never asked about. Stubbed stores, as in
 * auth-middleware-tenant.test.ts; makeReply is a local copy of that file's.
 */
const UUID = '11111111-1111-4111-8111-111111111111'
const REFUSAL = { code: 'LICENSE_LIMIT_EXCEEDED', message: 'read-only', connectionId: UUID }

function makeReply() {
  const res: { statusCode?: number; body?: unknown } = {}
  const reply = {
    status(code: number) {
      res.statusCode = code
      return reply
    },
    send(body: unknown) {
      res.body = body
      return reply
    },
    header() {
      return reply
    },
  }
  return { reply: reply as never, res }
}

// No adapter is enabled, so a request the gate lets through stops at the adapter
// lookup instead: 404 on the tenant path, 400 on the end-user path
// (end-user-auth-middleware.ts, the `registry.get` miss).
const registry = { get: () => null } as never
const store = {
  getRow: async () => ({ vertical: 'crm', platform: 'x', ownerTenantId: null }),
} as never
const routeConfig = (readSafe: boolean) => ({ config: readSafe ? { readSafe: true } : {} })

describe('tenant auth middleware: the write gate', () => {
  beforeEach(() => {
    process.env['ADMIN_SECRET'] = 'top-secret'
  })
  afterEach(() => {
    delete process.env['ADMIN_SECRET']
  })
  const request = (method: string, readSafe = false) =>
    ({
      query: { connection_id: UUID },
      headers: { 'x-admin-secret': 'top-secret' },
      method,
      routeOptions: routeConfig(readSafe),
    }) as never

  it('refuses a write on a read-only connection, admin secret included', async () => {
    const guard = vi.fn<ConnectionWriteGuard>(async () => REFUSAL)
    const { reply, res } = makeReply()
    await createUnifiedAuthMiddleware({ store, registry, connectionWriteGuard: guard })(
      request('POST'),
      reply,
    )
    expect(res).toEqual({ statusCode: 403, body: { error: REFUSAL } })
    expect(guard).toHaveBeenCalledWith(UUID)
  })
  it.each(['GET', 'HEAD'])('never asks about a %s', async (method) => {
    const guard = vi.fn<ConnectionWriteGuard>(async () => REFUSAL)
    const { reply, res } = makeReply()
    await createUnifiedAuthMiddleware({ store, registry, connectionWriteGuard: guard })(
      request(method),
      reply,
    )
    expect(guard).not.toHaveBeenCalled()
    expect(res).toMatchObject({ statusCode: 404, body: { error: { code: 'ADAPTER_UNAVAILABLE' } } })
  })
  it('a read-safe POST (/sync) is not a write', async () => {
    const guard = vi.fn<ConnectionWriteGuard>(async () => REFUSAL)
    const { reply, res } = makeReply()
    await createUnifiedAuthMiddleware({ store, registry, connectionWriteGuard: guard })(
      request('POST', true),
      reply,
    )
    expect(guard).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(404)
  })
  it('a write passes when the guard allows it', async () => {
    const guard = vi.fn<ConnectionWriteGuard>(async () => null)
    const { reply, res } = makeReply()
    await createUnifiedAuthMiddleware({ store, registry, connectionWriteGuard: guard })(
      request('DELETE'),
      reply,
    )
    expect(guard).toHaveBeenCalledOnce()
    expect(res).toMatchObject({ statusCode: 404, body: { error: { code: 'ADAPTER_UNAVAILABLE' } } })
  })
  it('without a guard, a write is untouched', async () => {
    const { reply, res } = makeReply()
    await createUnifiedAuthMiddleware({ store, registry })(request('POST'), reply)
    expect(res).toMatchObject({ statusCode: 404, body: { error: { code: 'ADAPTER_UNAVAILABLE' } } })
  })
})

describe('end-user auth middleware: the write gate', () => {
  afterEach(() => resetRateLimitBuckets())
  const tokens = {
    verify: async () => ({ endUserId: 'eu-1', tenantId: 't-1', scopes: ['eut:read'], id: 'tok-1' }),
  } as never
  const sessions = { connectionBelongsToEndUser: async () => true } as never
  const request = (method: string, readSafe = false) =>
    ({
      query: { connection_id: UUID },
      headers: { authorization: 'Bearer eut_x' },
      method,
      routeOptions: routeConfig(readSafe),
    }) as never
  const mw = (guard?: ConnectionWriteGuard) =>
    createUnifiedEndUserAuthMiddleware({
      store,
      registry,
      tokens,
      sessions,
      ...(guard ? { connectionWriteGuard: guard } : {}),
    })

  it('refuses a write on a read-only connection', async () => {
    const guard = vi.fn<ConnectionWriteGuard>(async () => REFUSAL)
    const { reply, res } = makeReply()
    await mw(guard)(request('PATCH'), reply)
    expect(res).toEqual({ statusCode: 403, body: { error: REFUSAL } })
    expect(guard).toHaveBeenCalledWith(UUID)
  })
  it.each(['GET', 'HEAD'])('never asks about a %s', async (method) => {
    const guard = vi.fn<ConnectionWriteGuard>(async () => REFUSAL)
    const { reply, res } = makeReply()
    await mw(guard)(request(method), reply)
    expect(guard).not.toHaveBeenCalled()
    expect(res).toMatchObject({ statusCode: 400, body: { error: { code: 'ADAPTER_UNAVAILABLE' } } })
  })
  it('a read-safe POST (/sync) is not a write', async () => {
    const guard = vi.fn<ConnectionWriteGuard>(async () => REFUSAL)
    const { reply, res } = makeReply()
    await mw(guard)(request('POST', true), reply)
    expect(guard).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })
  it('a write passes when the guard allows it', async () => {
    const guard = vi.fn<ConnectionWriteGuard>(async () => null)
    const { reply, res } = makeReply()
    await mw(guard)(request('POST'), reply)
    expect(guard).toHaveBeenCalledOnce()
    expect(res).toMatchObject({ statusCode: 400, body: { error: { code: 'ADAPTER_UNAVAILABLE' } } })
  })
  it('without a guard, a write is untouched', async () => {
    const { reply, res } = makeReply()
    await mw()(request('POST'), reply)
    expect(res).toMatchObject({ statusCode: 400, body: { error: { code: 'ADAPTER_UNAVAILABLE' } } })
  })
})
