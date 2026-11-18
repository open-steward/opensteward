/**
 * PII is optional when creating a customer, and the API has to mean it.
 *
 * `CreateEndUserBody.pii` must be nullable as well as optional. The admin's
 * form builds its PII object from whatever fields the operator filled in and
 * sends `null` when that is none of them, so an optional-but-not-nullable
 * schema would reject every no-PII create with:
 *
 *   pii: Invalid input: expected object, received null
 *
 * `UpdateEndUserBody.pii` is `.nullable().optional()` — "pass null to clear
 * stored PII" — and create must agree with update about the same field.
 *
 * Nothing below the schema needs special handling: the store takes
 * `pii?: EndUserPii | null`, and `encryptPii(null)` returns null rather than
 * storing an encrypted empty blob.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps, enrichErrorBody } from '../../src/core/routes/_openapi'
import { createEndUsersRoutes } from '../../src/core/routes/end-users'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { UnifiedClient } from '../../src/core/proxy/client'
import type { AdminStore } from '../../src/core/db/admin-store'

const createEndUser = vi.fn()
let app: FastifyInstance

beforeEach(async () => {
  createEndUser.mockReset().mockImplementation(async (body: Record<string, unknown>) => ({
    id: 'eu_1',
    tenantId: body.tenantId ?? 'default',
    email: body.email,
    displayName: null,
    externalReference: null,
    createdAt: Date.parse('2026-08-28T09:00:00.000Z'),
    updatedAt: Date.parse('2026-08-28T09:00:00.000Z'),
  }))

  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  // The same hook server.ts installs: without it the response schema sees raw
  // epoch numbers where it expects ISO strings, and every 200 becomes a 500.
  app.addHook('preSerialization', async (request, reply, payload) =>
    isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
  )
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))

  const client = { createEndUser } as unknown as UnifiedClient
  const adminStore = { writeAudit: vi.fn() } as unknown as AdminStore
  await app.register(createEndUsersRoutes(client, adminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

const token = () => app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })

const create = (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/end-users',
    headers: { authorization: `Bearer ${token()}` },
    payload: body,
  })

describe('POST /api/end-users — PII is optional', () => {
  it('accepts a null pii, which is what "the operator filled none in" looks like', async () => {
    const res = await create({ tenantId: 'default', email: 'jane@acme.example', pii: null })
    expect(res.statusCode).toBe(200)
    expect(createEndUser).toHaveBeenCalledWith(expect.objectContaining({ pii: null }))
  })

  it('accepts pii being absent entirely', async () => {
    const res = await create({ tenantId: 'default', email: 'jane@acme.example' })
    expect(res.statusCode).toBe(200)
  })

  it('still accepts pii when there is some', async () => {
    const res = await create({
      tenantId: 'default',
      email: 'jane@acme.example',
      pii: { firstName: 'Jane', lastName: 'Doe' },
    })
    expect(res.statusCode).toBe(200)
    expect(createEndUser).toHaveBeenCalledWith(
      expect.objectContaining({ pii: { firstName: 'Jane', lastName: 'Doe' } }),
    )
  })

  it('still rejects a pii that is neither an object nor null', async () => {
    // Widening to nullable must not widen to anything.
    const res = await create({ tenantId: 'default', email: 'jane@acme.example', pii: 'nope' })
    expect(res.statusCode).toBe(400)
  })

  it('reports the field by name when it does reject', async () => {
    // The rejection must name the field — `pii: ...` in the message is what
    // makes a refusal diagnosable.
    const res = await create({ tenantId: 'default', email: 'jane@acme.example', pii: 42 })
    expect(res.statusCode).toBe(400)
    expect(res.payload).toContain('pii')
  })
})
