/**
 * Labelling a webhook subscription, and finding it again.
 *
 * A subscription's UUID and URL are not what an operator arrives knowing —
 * without a label and search, the only way to find "the one that posts to
 * the billing service" is to read every row. So subscriptions carry an
 * operator-supplied label and the list supports `?search=`, matching
 * /connections, filtered server-side rather than in the browser for the same
 * reason: the browser can only ever search the rows it was already sent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { createWebhookSubsRoutes } from '../../src/core/routes/webhook-subs'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { UnifiedClient } from '../../src/core/proxy/client'
import type { AdminStore } from '../../src/core/db/admin-store'

/** Complete rows: the route serializes through the `WebhookSubscription` Zod
 *  schema, which requires createdAt/format/headerNames. */
const SUBS = [
  {
    id: 'whs_1',
    tenantId: 'default',
    url: 'https://hooks.acme.example/billing',
    label: 'Billing service',
    events: ['*'],
    createdAt: '2026-08-01T09:00:00.000Z',
    lastFiredAt: null,
    lastStatus: null,
    lastError: null,
    format: 'opensteward',
    headerNames: [],
  },
  {
    id: 'whs_2',
    tenantId: 'default',
    url: 'https://hooks.slack.com/services/T0/B0/xxx',
    label: 'Ops channel',
    events: ['*'],
    createdAt: '2026-08-02T09:00:00.000Z',
    lastFiredAt: null,
    lastStatus: null,
    lastError: null,
    format: 'slack',
    headerNames: [],
  },
  {
    id: 'whs_3',
    tenantId: 'other',
    url: 'https://hooks.acme.example/legacy',
    label: null,
    events: ['*'],
    createdAt: '2026-08-03T09:00:00.000Z',
    lastFiredAt: null,
    lastStatus: null,
    lastError: null,
    format: 'opensteward',
    headerNames: [],
  },
]

const listWebhookSubs = vi.fn()
const createWebhookSub = vi.fn()
const updateWebhookSub = vi.fn()

let app: FastifyInstance

beforeEach(async () => {
  listWebhookSubs
    .mockReset()
    .mockImplementation(async (tenantId?: string) =>
      tenantId ? SUBS.filter((s) => s.tenantId === tenantId) : SUBS,
    )
  createWebhookSub.mockReset().mockResolvedValue({ ...SUBS[0], secret: 'plaintext' })
  updateWebhookSub.mockReset().mockResolvedValue(SUBS[0])

  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))

  const client = { listWebhookSubs, createWebhookSub, updateWebhookSub } as unknown as UnifiedClient
  const adminStore = { writeAudit: vi.fn() } as unknown as AdminStore
  await app.register(createWebhookSubsRoutes(client, adminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

function token() {
  return app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
}

async function list(query: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/webhook-subscriptions${query}`,
    headers: { authorization: `Bearer ${token()}` },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

describe('GET /api/webhook-subscriptions?search=', () => {
  it('returns everything when no search is given', async () => {
    const { body } = await list('')
    expect(body.data).toHaveLength(3)
  })

  it('finds a subscription by its label, case-insensitively', async () => {
    const { body } = await list('?search=billing')
    expect(body.data.map((s: { id: string }) => s.id)).toEqual(['whs_1'])
  })

  it('matches a label substring, not just a prefix', async () => {
    const { body } = await list('?search=channel')
    expect(body.data.map((s: { id: string }) => s.id)).toEqual(['whs_2'])
  })

  it('also matches the URL, which is what an operator pastes from an incident', async () => {
    const { body } = await list('?search=hooks.slack.com')
    expect(body.data.map((s: { id: string }) => s.id)).toEqual(['whs_2'])
  })

  it('tolerates a subscription with no label', async () => {
    const { statusCode, body } = await list('?search=legacy')
    expect(statusCode).toBe(200)
    expect(body.data.map((s: { id: string }) => s.id)).toEqual(['whs_3'])
  })

  it('composes with the tenant filter instead of replacing it', async () => {
    const { body } = await list('?tenantId=default&search=acme.example')
    // whs_3 also matches the URL, but belongs to another tenant.
    expect(body.data.map((s: { id: string }) => s.id)).toEqual(['whs_1'])
  })

  it('reports the searched total, so the meta reflects the search', async () => {
    const { body } = await list('?search=billing')
    expect(body.meta.total).toBe(1)
  })

  it('returns an empty page rather than an error when nothing matches', async () => {
    const { statusCode, body } = await list('?search=zzzz-no-such-thing')
    expect(statusCode).toBe(200)
    expect(body.data).toEqual([])
    expect(body.meta.total).toBe(0)
  })

  it('ignores surrounding whitespace', async () => {
    const { body } = await list('?search=%20billing%20')
    expect(body.data).toHaveLength(1)
  })
})

describe('the label survives the round trip', () => {
  it('is passed through on create', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhook-subscriptions',
      headers: { authorization: `Bearer ${token()}` },
      payload: { tenantId: 'default', url: 'https://x.example/h', label: 'Billing service' },
    })
    expect(res.statusCode).toBe(201)
    expect(createWebhookSub).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Billing service' }),
    )
  })

  it('is returned by the list route rather than stripped by the response schema', async () => {
    // The schema is `.loose()`, but a field it does not declare is dropped by
    // Fastify's serializer — which is how `paused` became invisible to the
    // SDK. Declaring `label` is the only reason it survives to the client.
    const { body } = await list('')
    expect(body.data[0].label).toBe('Billing service')
    expect(body.data[2].label).toBeNull()
  })

  it('can be changed on its own, without also resending format or headers', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/webhook-subscriptions/whs_1',
      headers: { authorization: `Bearer ${token()}` },
      payload: { label: 'Renamed' },
    })
    expect(res.statusCode).toBe(200)
    expect(updateWebhookSub).toHaveBeenCalledWith(
      'whs_1',
      expect.objectContaining({ label: 'Renamed' }),
    )
  })

  it('still rejects a PATCH that changes nothing at all', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/webhook-subscriptions/whs_1',
      headers: { authorization: `Bearer ${token()}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(updateWebhookSub).not.toHaveBeenCalled()
  })
})

/**
 * `paused` survives serialization.
 *
 * The admin list renders a "Paused" badge from this field and flips the
 * Pause/Resume button on it, so if it is dropped on the way out the page shows
 * a paused subscription as live and the button can only ever pause — a
 * one-way switch, with deliveries stopped and nothing saying so.
 *
 * It survives today because `WebhookSubscription` is `.loose()`, which keeps
 * unknown keys through `safeParse` and emits `additionalProperties: {}` so
 * fast-json-stringify passes them through. That is incidental: tightening the
 * schema to `.strict()`, or a change in how the serializer derives its JSON
 * schema, would take the field with it and break the page silently. The field
 * is declared explicitly, and this pins the behaviour either way.
 */
describe('paused reaches the client', () => {
  // Its own rows rather than the shared fixture: adding one there shifts the
  // counts and search results every other test in this file asserts on.
  beforeEach(() => {
    listWebhookSubs.mockReset().mockResolvedValue([
      { ...SUBS[0], id: 'whs_paused', paused: true },
      { ...SUBS[1], id: 'whs_live' },
    ])
  })

  it('returns paused: true for a paused subscription', async () => {
    const { body } = await list('')
    const row = body.data.find((s: { id: string }) => s.id === 'whs_paused')
    expect(row).toBeDefined()
    expect(Object.keys(row)).toContain('paused')
    expect(row.paused).toBe(true)
  })

  it('does not invent a value for a subscription that has never been paused', async () => {
    // Absent upstream must not serialize as `false`: that would read as a
    // deliberate "not paused" for rows predating the field.
    const { body } = await list('')
    const row = body.data.find((s: { id: string }) => s.id === 'whs_live')
    expect(row.paused).toBeUndefined()
  })

  it('is declared on the schema, not merely tolerated by it', async () => {
    // The reason to declare it: an undeclared field is absent from the
    // generated OpenAPI, SDK types and CLI, so a consumer cannot see a field
    // the wire has been carrying all along.
    const { WebhookSubscription } = await import('../../src/core/routes/_openapi')
    expect(Object.keys((WebhookSubscription as { shape: object }).shape)).toContain('paused')
  })
})
