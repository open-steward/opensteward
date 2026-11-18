/**
 * `DELETE /v1/customers/:id?cascade=connections` — the erasure-request shape.
 *
 * Dropping only the `end_users` row would leave the OAuth grant, cached
 * resources and sync history behind while answering 204 as if the person
 * were gone. The cascade is opt-in (plain deletes stay non-cascading),
 * tenant-scoped, and goes through the standard connection-delete path so
 * every derived-state listener fires.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { createCustomersRouter } from '../../src/control-plane/customers-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'

const SECRET = 'customer-erasure-secret-must-be-32-ch!'

describe('customer delete cascade', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let apiKeys: ApiKeyStore
  let endUsers: EndUserStore
  let sessions: ConnectSessionStore
  let credentials: CredentialStore

  beforeEach(async () => {
    resetRateLimitBuckets()
    handle = await openDb({ sqlitePath: ':memory:' })
    apiKeys = await ApiKeyStore.create(handle, SECRET)
    endUsers = await EndUserStore.create(handle, SECRET)
    sessions = await ConnectSessionStore.create(handle)
    credentials = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(createCustomersRouter({ apiKeys, endUsers, sessions, credentials }))
    await fastify.ready()
  })
  afterEach(async () => {
    await fastify?.close()
    await handle?.close()
  })

  const bearer = (plaintext: string) => ({ authorization: `Bearer ${plaintext}` })

  /** Customer + consumed connect session + the connection it produced. */
  async function seedCustomerWithConnection(tenantId: string) {
    const customer = await endUsers.create({ tenantId, email: `c-${tenantId}@x.example` })
    const connectionId = await credentials.create(
      'fortnox',
      'oauth-tenant',
      { accessToken: 'tok' },
      null,
      'accounting',
      tenantId,
    )
    const session = await sessions.create({
      tenantId,
      label: 'onboarding',
      endUserId: customer.id,
    })
    await sessions.markConsumed(session.id, connectionId)
    return { customer, connectionId }
  }

  it('plain delete keeps its old meaning — the connection survives', async () => {
    const key = await apiKeys.mint({ tenantId: 't', scopes: ['*'] })
    const { customer, connectionId } = await seedCustomerWithConnection('t')
    const res = await fastify.inject({
      method: 'DELETE',
      url: `/v1/customers/${customer.id}`,
      headers: bearer(key.plaintext),
    })
    expect(res.statusCode).toBe(204)
    expect(await credentials.getRow(connectionId)).not.toBeNull()
  })

  it('?cascade=connections deletes the connections and fires the listeners', async () => {
    const key = await apiKeys.mint({ tenantId: 't', scopes: ['*'] })
    const { customer, connectionId } = await seedCustomerWithConnection('t')
    const cascaded: string[] = []
    credentials.onDelete(async (row) => {
      cascaded.push(row.id)
    })

    const res = await fastify.inject({
      method: 'DELETE',
      url: `/v1/customers/${customer.id}?cascade=connections`,
      headers: bearer(key.plaintext),
    })
    expect(res.statusCode).toBe(204)
    expect(await credentials.getRow(connectionId)).toBeNull()
    expect(cascaded).toEqual([connectionId])
    expect(await endUsers.getById(customer.id)).toBeNull()
  })

  it('the cascade is tenant-scoped: another tenant’s connection is left alone', async () => {
    const key = await apiKeys.mint({ tenantId: 't', scopes: ['*'] })
    const customer = await endUsers.create({ tenantId: 't', email: 'shared@x.example' })
    // A session that (incorrectly or historically) points at a connection
    // owned by someone else must not let this tenant delete it.
    const foreignConnection = await credentials.create(
      'fortnox',
      'oauth-tenant',
      { accessToken: 'tok' },
      null,
      'accounting',
      't_other',
    )
    const session = await sessions.create({
      tenantId: 't',
      label: 'crossed',
      endUserId: customer.id,
    })
    await sessions.markConsumed(session.id, foreignConnection)

    const res = await fastify.inject({
      method: 'DELETE',
      url: `/v1/customers/${customer.id}?cascade=connections`,
      headers: bearer(key.plaintext),
    })
    expect(res.statusCode).toBe(204)
    expect(await credentials.getRow(foreignConnection)).not.toBeNull()
  })
})
