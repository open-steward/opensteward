/**
 * Renaming a connection through admin-api.
 *
 * Developers have had `PATCH /v1/connections/{id}` since the label existed;
 * the operator surface had only `GET` and `DELETE`, so a connection that
 * arrived unlabelled — anything created through
 * `/auth/{vertical}/{platform}/connect` without `?label=` — could never be
 * named from the admin UI. The label is what the list links and what
 * `?search=` matches, so an unnamed connection is the one an operator cannot
 * find again.
 *
 * What this pins is the part the path adds over the upstream PATCH: the
 * vertical in the URL has to mean something (upstream keys on the id alone),
 * whitespace is not a name, and the rename is auditable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { createConnectionsRoutes } from '../../src/core/routes/connections'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { Aggregator } from '../../src/core/proxy/aggregator'
import type { AdminStore } from '../../src/core/db/admin-store'

/** Complete row: the route serializes through the `Connection` Zod schema,
 *  which requires createdAt/updatedAt — a partial fixture 500s on the way out. */
const ROW = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: null as string | null,
  status: 'valid',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
}

let app: FastifyInstance
const getConnection = vi.fn()
const updateConnectionLabel = vi.fn()
const writeAudit = vi.fn()

beforeEach(async () => {
  getConnection.mockReset().mockResolvedValue(ROW)
  updateConnectionLabel
    .mockReset()
    .mockImplementation(async (_id: string, label: string | null) => ({ ...ROW, label }))
  writeAudit.mockReset()

  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))

  const aggregator = {
    allConnections: async () => [ROW],
    knownVertical: (v: string) => ['accounting', 'payments'].includes(v),
    getClient: () => ({ getConnection, updateConnectionLabel }),
  } as unknown as Aggregator
  await app.register(createConnectionsRoutes(aggregator, { writeAudit } as unknown as AdminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

function patch(body: unknown, opts: { role?: string; vertical?: string } = {}) {
  const token = app.jwt.sign({ id: 'u1', username: 'admin', role: opts.role ?? 'admin' })
  return app.inject({
    method: 'PATCH',
    url: `/api/connections/${opts.vertical ?? 'accounting'}/${ROW.id}`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  })
}

describe('PATCH /api/connections/:vertical/:id', () => {
  it('renames the connection and returns the new label', async () => {
    const res = await patch({ label: 'Acme Books' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.label).toBe('Acme Books')
    expect(updateConnectionLabel).toHaveBeenCalledWith(ROW.id, 'Acme Books')
  })

  it('clears the label when sent null', async () => {
    await patch({ label: null })
    expect(updateConnectionLabel).toHaveBeenCalledWith(ROW.id, null)
  })

  it('treats a whitespace-only label as a clear, not as a name made of spaces', async () => {
    await patch({ label: '   ' })
    expect(updateConnectionLabel).toHaveBeenCalledWith(ROW.id, null)
  })

  it('trims a label rather than storing the paste as typed', async () => {
    await patch({ label: '  Acme Books  ' })
    expect(updateConnectionLabel).toHaveBeenCalledWith(ROW.id, 'Acme Books')
  })

  it('rejects a body with no label at all', async () => {
    const res = await patch({})
    expect(res.statusCode).toBe(400)
    expect(updateConnectionLabel).not.toHaveBeenCalled()
  })

  it('404s an unknown vertical', async () => {
    const res = await patch({ label: 'x' }, { vertical: 'nosuch' })
    expect(res.statusCode).toBe(404)
    expect(updateConnectionLabel).not.toHaveBeenCalled()
  })

  it("404s when the id belongs to a different vertical than the path names", async () => {
    // Upstream PATCH is keyed on the id alone, so without the read-first check
    // this would rename a payments connection through the accounting path.
    getConnection.mockResolvedValue({ ...ROW, vertical: 'payments' })
    const res = await patch({ label: 'x' })
    expect(res.statusCode).toBe(404)
    expect(updateConnectionLabel).not.toHaveBeenCalled()
  })

  it('404s when the connection is gone by the time the write lands', async () => {
    updateConnectionLabel.mockResolvedValue(null)
    const res = await patch({ label: 'x' })
    expect(res.statusCode).toBe(404)
  })

  it('writes an audit entry naming the connection', async () => {
    await patch({ label: 'Acme Books' })
    expect(writeAudit).toHaveBeenCalledWith('u1', 'connection.update', 'accounting', ROW.id)
  })

  it('does not audit a rename that failed', async () => {
    updateConnectionLabel.mockResolvedValue(null)
    await patch({ label: 'x' })
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('refuses a viewer, who may read connections but not rename one', async () => {
    const res = await patch({ label: 'x' }, { role: 'viewer' })
    expect(res.statusCode).toBe(403)
    expect(updateConnectionLabel).not.toHaveBeenCalled()
  })

  it('relays a duplicate-label 409 rather than reporting it as a fault of ours', async () => {
    // The label index is per (tenant, platform); the operator fixes this by
    // choosing another name, which they can only do if told that is the problem.
    updateConnectionLabel.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { error: { code: 'DUPLICATE_LABEL', message: "Connection label 'Acme Books' already exists" } },
        },
      }),
    )
    const res = await patch({ label: 'Acme Books' })
    expect(res.statusCode).toBe(409)
    expect(JSON.stringify(res.json())).toContain('already exists')
  })
})
