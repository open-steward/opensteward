/**
 * Minting a Connect Link must not modify the customer it names.
 *
 * The admin's link form carries a "Display name" box hinted "used only when
 * creating a new customer record". The request takes the email path whenever
 * the hidden `endUserId` is unset — so on a pasted address, a
 * typed-and-submitted one, or a customer outside the datalist's ten results —
 * and `upsertByEmail` patches an existing row whenever `displayName !==
 * undefined`. Passing the box through, as in
 *
 *   endUsers.upsertByEmail({ tenantId, email, displayName: body.customerDisplayName ?? null })
 *
 * would therefore rename an existing customer on a filled-in box and — via
 * `?? null` — wipe their name on an empty one. Silently, while doing
 * something that has nothing to do with editing a customer.
 *
 * Renaming a customer is what PATCH /admin/end-users/:id is for. These tests pin
 * that this path only ever reads.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { createConnectAdminRouter } from '../../src/control-plane/connect-admin-router'

const SECRET = 'connect-preserves-customer-secret-must-be-32'

let handle: DbHandle
let fastify: FastifyInstance
let endUsers: EndUserStore

beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
  endUsers = await EndUserStore.create(handle, SECRET)
  const sessions = await ConnectSessionStore.create(handle)

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

/** Mint a link the way the admin does when it has no endUserId to send. */
const mintByEmail = (email: string, customerDisplayName?: string) =>
  fastify.inject({
    method: 'POST',
    url: '/admin/connect-sessions',
    payload: {
      tenantId: 'default',
      label: 'Acme onboarding',
      customerEmail: email,
      ...(customerDisplayName === undefined ? {} : { customerDisplayName }),
    },
  })

describe('minting a link by email leaves an existing customer alone', () => {
  it('does not wipe their display name when the box is left empty', async () => {
    // The worse of the two, because it needs no input at all: `?? null` turned
    // "the operator typed nothing" into "set this customer's name to null".
    const created = await endUsers.create({
      tenantId: 'default',
      email: 'jane@acme.example',
      displayName: 'Jane Doe (Acme)',
    })

    const res = await mintByEmail('jane@acme.example')
    expect(res.statusCode).toBe(201)

    const after = await endUsers.getById(created.id)
    expect(after?.displayName).toBe('Jane Doe (Acme)')
  })

  it('does not rename them when the box is filled in', async () => {
    const created = await endUsers.create({
      tenantId: 'default',
      email: 'jane@acme.example',
      displayName: 'Jane Doe (Acme)',
    })

    const res = await mintByEmail('jane@acme.example', 'Someone Else Entirely')
    expect(res.statusCode).toBe(201)

    const after = await endUsers.getById(created.id)
    expect(after?.displayName).toBe('Jane Doe (Acme)')
  })

  it('still resolves to that customer rather than duplicating them', async () => {
    const created = await endUsers.create({
      tenantId: 'default',
      email: 'jane@acme.example',
      displayName: 'Jane Doe (Acme)',
    })

    await mintByEmail('jane@acme.example')

    const all = await endUsers.list({ tenantId: 'default' })
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(created.id)
  })

  it('matches case-insensitively, as the store stores lowercased', async () => {
    const created = await endUsers.create({
      tenantId: 'default',
      email: 'jane@acme.example',
      displayName: 'Jane Doe (Acme)',
    })

    await mintByEmail('JANE@ACME.EXAMPLE', 'Should Be Ignored')

    expect((await endUsers.getById(created.id))?.displayName).toBe('Jane Doe (Acme)')
    expect(await endUsers.list({ tenantId: 'default' })).toHaveLength(1)
  })
})

describe('a genuinely new email still creates the customer', () => {
  it('creates them with the display name that was typed', async () => {
    const res = await mintByEmail('new@acme.example', 'New Person (Acme)')
    expect(res.statusCode).toBe(201)

    const created = await endUsers.findByEmail('default', 'new@acme.example')
    expect(created).not.toBeNull()
    expect(created!.displayName).toBe('New Person (Acme)')
  })

  it('creates them with no name when none was typed', async () => {
    const res = await mintByEmail('nameless@acme.example')
    expect(res.statusCode).toBe(201)

    const created = await endUsers.findByEmail('default', 'nameless@acme.example')
    expect(created).not.toBeNull()
    expect(created!.displayName).toBeNull()
  })

  it("creates them in the link's tenant, not the default one", async () => {
    // The tenant-agreement work relies on this: a link and its customer must
    // belong to the same tenant, and by-email creation is what makes that true
    // by construction.
    const res = await mintByEmail('other@acme.example')
    expect(res.statusCode).toBe(201)

    const inDefault = await endUsers.findByEmail('default', 'other@acme.example')
    expect(inDefault?.tenantId).toBe('default')
  })
})
