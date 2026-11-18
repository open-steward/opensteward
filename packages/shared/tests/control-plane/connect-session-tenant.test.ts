/**
 * A Connect Link may not name a customer from another tenant.
 *
 * The link's tenant becomes the resulting connection's `ownerTenantId`
 * (auth-router), and that decides which tenant's API keys can read the
 * connection, whose webhooks hear about it, and who owns its sync jobs. So a
 * link created in `default` for a customer who lives in `dept-a` would hand a
 * real customer's connection to the wrong tenant — the one thing tenants exist
 * to prevent.
 *
 * The admin path refuses this the same way the API path does —
 * `customers-router` treats a customer outside the caller's tenant as
 * CUSTOMER_NOT_FOUND — because offering the tenant in the UI makes the
 * mismatch reachable.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { createConnectAdminRouter } from '../../src/control-plane/connect-admin-router'

const SECRET = 'connect-tenant-test-secret-must-be-32-chars'

let handle: DbHandle
let fastify: FastifyInstance
let endUsers: EndUserStore
let sessions: ConnectSessionStore

beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
  endUsers = await EndUserStore.create(handle, SECRET)
  sessions = await ConnectSessionStore.create(handle)

  fastify = Fastify({ logger: false })
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
  await fastify?.close()
  await handle?.close()
})

const mint = (payload: Record<string, unknown>) =>
  fastify.inject({
    method: 'POST',
    url: '/admin/connect-sessions',
    payload: { label: 'Acme onboarding', ...payload },
  })

describe('a Connect Link and its customer must agree on the tenant', () => {
  it('refuses a customer who belongs to another tenant', async () => {
    const customer = await endUsers.create({ tenantId: 'dept-a', email: 'jane@acme.example' })

    const res = await mint({ tenantId: 'default', endUserId: customer.id })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ error: { code: 'CUSTOMER_NOT_FOUND' } })
    // Refused, not created. A session that exists with the wrong tenant is the
    // failure this prevents — the check is worthless if it only reports.
    expect(await sessions.list({ tenantId: 'default' })).toHaveLength(0)
  })

  it('accepts the same customer in their own tenant', async () => {
    const customer = await endUsers.create({ tenantId: 'dept-a', email: 'jane@acme.example' })

    const res = await mint({ tenantId: 'dept-a', endUserId: customer.id })

    expect(res.statusCode).toBe(201)
    expect(await sessions.list({ tenantId: 'dept-a' })).toHaveLength(1)
  })

  it('refuses a well-formed customer id that does not exist', async () => {
    // A UUID, so it clears schema validation and actually reaches the guard —
    // a malformed id is rejected as a 400 before this code ever runs.
    const res = await mint({
      tenantId: 'default',
      endUserId: '00000000-0000-4000-8000-000000000000',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ error: { code: 'CUSTOMER_NOT_FOUND' } })
  })

  it("creates a customer given by email in the link's own tenant", async () => {
    // No check needed on this path — the upsert puts them in the link's tenant,
    // so they agree by construction. Pinned because it is the reason the guard
    // is scoped to `endUserId` rather than applied to both paths.
    const res = await mint({ tenantId: 'dept-a', customerEmail: 'new@acme.example' })

    expect(res.statusCode).toBe(201)
    const created = await endUsers.findByEmail('dept-a', 'new@acme.example')
    expect(created).not.toBeNull()
    expect(created!.tenantId).toBe('dept-a')
    // And not smuggled into the default tenant.
    expect(await endUsers.findByEmail('default', 'new@acme.example')).toBeNull()
  })

  it('leaves a single-tenant deployment completely alone', async () => {
    // Everything in `default`, which is every deployment that never touches
    // tenants. The guard must be invisible there.
    const customer = await endUsers.create({ tenantId: 'default', email: 'jane@acme.example' })
    const res = await mint({ tenantId: 'default', endUserId: customer.id })
    expect(res.statusCode).toBe(201)
  })
})
