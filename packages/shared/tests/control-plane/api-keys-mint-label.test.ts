/**
 * Minting a key without a label must work at every entry point.
 *
 * The admin UI sends `label: label || null`, and admin-api normalises an
 * absent label to `null` too — so this router's body schema must accept
 * `string | null`. A `.strict()` schema that only allows `string | undefined`
 * turns the normal case into a validation error, and the 400 travels back up
 * as admin-api's generic "Request failed with status code 400", which tells
 * the operator nothing about what to change.
 *
 * "No label" is a legitimate state the store models (the column is nullable
 * and `label ?? null` is written on the happy path), so the schema must
 * accept it too.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { createApiKeysAdminRouter } from '../../src/control-plane/api-keys-admin-router'

const SECRET = 'test-store-secret-at-least-32-chars-long!!'
const ADMIN_SECRET = 'test-admin-secret-value'

let handle: DbHandle
let fastify: FastifyInstance

beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
  const apiKeys = await ApiKeyStore.create(handle, SECRET)
  process.env['ADMIN_SECRET'] = ADMIN_SECRET
  fastify = Fastify({ logger: false })
  await fastify.register(createApiKeysAdminRouter({ apiKeys }))
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
    url: '/admin/api-keys',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: body,
  })
  return { status: res.statusCode, body: JSON.parse(res.payload) }
}

describe('POST /admin/api-keys — an unlabelled key', () => {
  it('accepts an explicit null label', async () => {
    const { status, body } = await mint({ tenantId: 'default', label: null, scopes: ['customers:read'] })
    expect(status).toBe(201)
    expect(body.data.label).toBeNull()
  })

  it('accepts an omitted label', async () => {
    const { status, body } = await mint({ tenantId: 'default', scopes: ['customers:read'] })
    expect(status).toBe(201)
    expect(body.data.label).toBeNull()
  })

  it('still accepts a real label', async () => {
    const { status, body } = await mint({ tenantId: 'default', label: 'CI runner', scopes: ['customers:read'] })
    expect(status).toBe(201)
    expect(body.data.label).toBe('CI runner')
  })

  it('still rejects a label that is not a string', async () => {
    const { status } = await mint({ tenantId: 'default', label: 42 })
    expect(status).toBe(400)
  })

  it('still rejects an over-long label', async () => {
    const { status } = await mint({ tenantId: 'default', label: 'x'.repeat(201) })
    expect(status).toBe(400)
  })
})
