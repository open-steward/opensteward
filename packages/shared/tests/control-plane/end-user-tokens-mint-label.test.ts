/**
 * Minting an MCP token for a customer failed whenever no label was typed.
 *
 * Same defect as api-keys-mint-label.test.ts, one router over. The admin UI
 * sends `label: request.body?.label?.trim() || null`, and admin-api normalises
 * an absent label to `null` as well (`label: body.label ?? null`) — so `null`
 * is what actually arrives on the wire, always. This router's body schema
 * accepted `string | undefined` inside a `.strict()` object, so `null` was a
 * validation error and the operator got admin-api's generic "Request failed
 * with status code 400" with nothing to act on.
 *
 * `createdBy` has the identical shape: admin-api's proxy client types it
 * `string | null`, so the schema has to accept the null too.
 *
 * "No label" is a state the store already models — `mint` takes
 * `label?: string | null` and writes `input.label ?? null` into a nullable
 * column — so the schema is what was wrong.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { EndUserTokenStore } from '../../src/auth/end-user-tokens'
import { createEndUserTokensAdminRouter } from '../../src/control-plane/end-user-tokens-admin-router'

const SECRET = 'test-store-secret-at-least-32-chars-long!!'
const ADMIN_SECRET = 'test-admin-secret-value'

let handle: DbHandle
let fastify: FastifyInstance

beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
  const tokens = await EndUserTokenStore.create(handle, SECRET)
  process.env['ADMIN_SECRET'] = ADMIN_SECRET
  fastify = Fastify({ logger: false })
  await fastify.register(createEndUserTokensAdminRouter({ tokens }))
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  await handle?.close()
  delete process.env['ADMIN_SECRET']
})

async function mint(body: Record<string, unknown>) {
  const res = await fastify.inject({
    method: 'POST',
    url: '/admin/end-user-tokens',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: body,
  })
  return { status: res.statusCode, body: JSON.parse(res.payload) }
}

const BASE = { endUserId: 'cus_4Qm2Xa9Lr', tenantId: 'acme' }

describe('POST /admin/end-user-tokens — an unlabelled token', () => {
  it('accepts an explicit null label', async () => {
    const { status, body } = await mint({ ...BASE, label: null })
    expect(status).toBe(201)
    expect(body.data.label).toBeNull()
  })

  it('accepts an omitted label', async () => {
    const { status, body } = await mint({ ...BASE })
    expect(status).toBe(201)
    expect(body.data.label).toBeNull()
  })

  it('accepts the exact body admin-api forwards for an unlabelled mint', async () => {
    const { status, body } = await mint({
      ...BASE,
      label: null,
      createdBy: 'usr_operator_1',
    })
    expect(status).toBe(201)
    expect(body.data.label).toBeNull()
    expect(body.data.plaintext).toMatch(/^eut_/)
  })

  it('accepts a null createdBy', async () => {
    const { status } = await mint({ ...BASE, label: null, createdBy: null })
    expect(status).toBe(201)
  })

  it('still accepts a real label', async () => {
    const { status, body } = await mint({ ...BASE, label: 'Claude Desktop' })
    expect(status).toBe(201)
    expect(body.data.label).toBe('Claude Desktop')
  })

  it('still rejects a label that is not a string', async () => {
    const { status } = await mint({ ...BASE, label: 42 })
    expect(status).toBe(400)
  })

  it('still rejects an over-long label', async () => {
    const { status } = await mint({ ...BASE, label: 'x'.repeat(201) })
    expect(status).toBe(400)
  })

  it('still rejects an unknown field', async () => {
    const { status } = await mint({ ...BASE, label: null, nope: 'x' })
    expect(status).toBe(400)
  })
})
