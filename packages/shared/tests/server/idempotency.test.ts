import { afterEach, describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'
import { registerIdempotency, type IdempotencyStore } from '../../src/server/idempotency'

/**
 * The Idempotency-Key middleware. It is registered on the root, ahead of every
 * plugin, so these tests build the same shape integration-server has: a child
 * scope whose instance preHandlers authenticate and then gate (a vertical
 * plugin's authMiddleware and licenseGate), and routes inside it.
 *
 * What they pin: a key is claimed only once the request has passed those
 * hooks, and a response that says nothing happened and may not hold on a
 * retry (a refusal) is never stored. Otherwise a 403 from the license gate was
 * replayed for 24 h after the slot was freed or the license renewed.
 */

type Answer = { status: number; body?: unknown }

interface Harness {
  app: FastifyInstance
  /** How many times a route handler ran. */
  calls: () => number
  /** What the gate preHandler answers instead of letting the request through; null lets it through. */
  gate: { refusal: Answer | null }
  /** Answers the POST handler gives, one per call; empty means 201 `{ id }`. */
  answers: Answer[]
}

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const LIMIT_REFUSAL = {
  error: {
    code: 'LICENSE_LIMIT_EXCEEDED',
    message: 'read-only',
    limitKey: 'connections',
    limit: 1,
    used: 2,
  },
}

async function build(store?: IdempotencyStore): Promise<Harness> {
  let calls = 0
  const gate: Harness['gate'] = { refusal: null }
  const answers: Answer[] = []
  let release: (() => void) | undefined
  const fastify = Fastify()
  registerIdempotency(fastify, store)
  await fastify.register(
    async (scope) => {
      // A vertical plugin's authMiddleware: 401 without a credential, else sets
      // the tenant. `Bearer <key>@<tenant>`, or `Bearer <tenant>` for short.
      scope.addHook('preHandler', async (request, reply) => {
        const auth = request.headers['authorization']
        if (typeof auth !== 'string') {
          await reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'no' } })
          return
        }
        ;(request as unknown as Record<string, unknown>)['tenantId'] = auth.split('@').pop()!
      })
      // ...and its licenseGate, added after it.
      scope.addHook('preHandler', async (_request, reply) => {
        if (gate.refusal) await reply.status(gate.refusal.status).send(gate.refusal.body)
      })
      scope.post('/things', async (_request, reply: FastifyReply) => {
        calls++
        const next = answers.shift()
        if (next) return reply.status(next.status).send(next.body)
        return reply.status(201).send({ id: `thing-${calls}` })
      })
      scope.post('/slow', async (_request, reply) => {
        calls++
        await new Promise<void>((resolve) => (release = resolve))
        return reply.status(201).send({ id: `slow-${calls}` })
      })
      scope.delete('/things/:id', async (_request, reply) => {
        calls++
        return reply.status(204).send()
      })
      scope.post('/stream', async (_request, reply) => {
        calls++
        return reply.type('text/plain').send(Readable.from(['a', 'b']))
      })
      scope.post('/hijacked', async (_request, reply) => {
        calls++
        reply.hijack()
        reply.raw.writeHead(200, { 'content-type': 'text/plain' })
        reply.raw.end('raw')
      })
    },
    { prefix: '/v1' },
  )
  // A route that authenticates inside its handler (POST /auth/:v/:p/connect
  // does): no hook sets a tenant before the key is claimed.
  fastify.post('/self-auth', async (request, reply) => {
    if (typeof request.headers['authorization'] !== 'string') {
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'no' } })
    }
    calls++
    return reply.status(201).send({ id: `self-${calls}` })
  })
  ;(fastify as unknown as { releaseSlow: () => void }).releaseSlow = () => release?.()
  app = fastify
  return { app: fastify, calls: () => calls, gate, answers }
}

const as = (tenant: string) => ({ authorization: `Bearer ${tenant}` })
const post = (
  h: Harness,
  key: string | undefined,
  opts: { url?: string; tenant?: string | null; body?: unknown } = {},
) =>
  h.app.inject({
    method: 'POST',
    url: opts.url ?? '/v1/things',
    headers: {
      ...(opts.tenant === null ? {} : as(opts.tenant ?? 'tenant-a')),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    payload: (opts.body ?? { amount: 1 }) as Record<string, unknown>,
  })
const replayed = (res: { headers: Record<string, unknown> }): boolean =>
  res.headers['idempotency-replayed'] === 'true'

describe('Idempotency-Key: the contract that stays', () => {
  it('replays a completed write verbatim, and the handler runs once', async () => {
    const h = await build()
    const first = await post(h, 'k-1')
    expect(first.statusCode).toBe(201)
    expect(replayed(first)).toBe(false)
    const again = await post(h, 'k-1')
    expect(again.statusCode).toBe(201)
    expect(replayed(again)).toBe(true)
    expect(again.json()).toEqual(first.json())
    expect(h.calls()).toBe(1)
  })

  it('a handler error that may have taken effect is still replayed (only refusals are exempt)', async () => {
    const h = await build()
    h.answers.push({ status: 502, body: { error: { code: 'UPSTREAM_ERROR', message: 'x' } } })
    expect((await post(h, 'k-err')).statusCode).toBe(502)
    const again = await post(h, 'k-err')
    expect(again.statusCode).toBe(502)
    expect(replayed(again)).toBe(true)
    expect(h.calls()).toBe(1)
  })

  it('a 204 with no body is stored and replayed, not left "in flight"', async () => {
    const h = await build()
    const del = () =>
      h.app.inject({
        method: 'DELETE',
        url: '/v1/things/t-1',
        headers: { ...as('tenant-a'), 'idempotency-key': 'k-del' },
      })
    expect((await del()).statusCode).toBe(204)
    const again = await del()
    expect(again.statusCode).toBe(204)
    expect(replayed(again)).toBe(true)
    expect(h.calls()).toBe(1)
  })

  it('refuses a key over 255 characters', async () => {
    const h = await build()
    const res = await post(h, 'k'.repeat(256))
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ code: 'idempotency_key_invalid' })
    expect(h.calls()).toBe(0)
  })

  it('a concurrent retry answers 409 in flight, and the first result is what later replays', async () => {
    const h = await build()
    const first = post(h, 'k-slow', { url: '/v1/slow' })
    // Let the first request reach its handler and hold the claim.
    await new Promise((r) => setTimeout(r, 20))
    const concurrent = await post(h, 'k-slow', { url: '/v1/slow' })
    expect(concurrent.statusCode).toBe(409)
    expect(concurrent.headers['retry-after']).toBe('1')
    ;(h.app as unknown as { releaseSlow: () => void }).releaseSlow()
    expect((await first).statusCode).toBe(201)
    const later = await post(h, 'k-slow', { url: '/v1/slow' })
    expect(later.statusCode).toBe(201)
    expect(replayed(later)).toBe(true)
    expect(h.calls()).toBe(1)
  })
})

describe('Idempotency-Key: a refusal is never stored', () => {
  it('a license refusal from a gate before the handler is not replayed once the slot is freed (P6)', async () => {
    const h = await build()
    h.gate.refusal = { status: 403, body: LIMIT_REFUSAL }
    const refused = await post(h, 'k-1')
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error.code).toBe('LICENSE_LIMIT_EXCEEDED')

    h.gate.refusal = null // the operator deleted a connection, or renewed
    const retry = await post(h, 'k-1')
    expect(retry.statusCode).toBe(201)
    expect(replayed(retry)).toBe(false)
    expect(h.calls()).toBe(1)
    // The write that did happen is what the key now replays.
    const again = await post(h, 'k-1')
    expect(replayed(again)).toBe(true)
    expect(again.json()).toEqual(retry.json())
    expect(h.calls()).toBe(1)
  })

  it('nothing a hook before the handler answers is stored, whatever its status (a 404 for an adapter enabled since)', async () => {
    const h = await build()
    h.gate.refusal = {
      status: 404,
      body: { error: { code: 'ADAPTER_UNAVAILABLE', message: 'not enabled' } },
    }
    expect((await post(h, 'k-404')).statusCode).toBe(404)
    h.gate.refusal = null
    const retry = await post(h, 'k-404')
    expect(retry.statusCode).toBe(201)
    expect(replayed(retry)).toBe(false)
  })

  it('a license refusal the handler itself sends is not stored, whatever its status', async () => {
    const h = await build()
    h.answers.push(
      { status: 403, body: { error: { code: 'LICENSE_FEATURE_NOT_ENTITLED', message: 'x' } } },
      { status: 503, body: { error: { code: 'LICENSE_STATUS_UNAVAILABLE', message: 'x' } } },
    )
    expect((await post(h, 'k-lic')).statusCode).toBe(403)
    const second = await post(h, 'k-lic')
    expect(second.statusCode).toBe(503)
    expect(replayed(second)).toBe(false)
    const third = await post(h, 'k-lic')
    expect(third.statusCode).toBe(201)
    expect(replayed(third)).toBe(false)
    expect(h.calls()).toBe(3)
  })

  it.each([401, 403, 409, 429])(
    'a %i from the handler says nothing happened: not stored, the retry runs',
    async (status) => {
      const h = await build()
      h.answers.push({ status, body: { error: { code: 'REFUSED', message: 'x' } } })
      expect((await post(h, `k-${status}`)).statusCode).toBe(status)
      const retry = await post(h, `k-${status}`)
      expect(retry.statusCode).toBe(201)
      expect(replayed(retry)).toBe(false)
      expect(h.calls()).toBe(2)
    },
  )

  it('auth runs before the key is claimed: an unauthenticated 401 is not replayed to an authenticated retry', async () => {
    const h = await build()
    const anon = await post(h, 'k-auth', { tenant: null })
    expect(anon.statusCode).toBe(401)
    const authed = await post(h, 'k-auth')
    expect(authed.statusCode).toBe(201)
    expect(replayed(authed)).toBe(false)
  })

  it('a stored response is never replayed to an unauthenticated caller', async () => {
    const h = await build()
    expect((await post(h, 'k-leak')).statusCode).toBe(201)
    const anon = await post(h, 'k-leak', { tenant: null })
    expect(anon.statusCode).toBe(401)
    expect(replayed(anon)).toBe(false)
  })
})

describe('Idempotency-Key: what a key is scoped to', () => {
  it('the key carries the tenant auth set: one tenant never receives another tenant’s response', async () => {
    const h = await build()
    const a = await post(h, 'k-shared', { tenant: 'tenant-a' })
    const b = await post(h, 'k-shared', { tenant: 'tenant-b' })
    expect(b.statusCode).toBe(201)
    expect(replayed(b)).toBe(false)
    expect(b.json()).not.toEqual(a.json())
    expect(h.calls()).toBe(2)
  })

  it('the key is the tenant’s, as auth set it: a second credential of the same tenant replays', async () => {
    const h = await build()
    const first = await post(h, 'k-tenant', { tenant: 'key-1@tenant-a' })
    const second = await post(h, 'k-tenant', { tenant: 'key-2@tenant-a' })
    expect(replayed(second)).toBe(true)
    expect(second.json()).toEqual(first.json())
    expect(h.calls()).toBe(1)
  })

  it('on a route that authenticates in its handler, the key is the credential’s', async () => {
    const h = await build()
    const asX = await post(h, 'k-self', { url: '/self-auth', tenant: 'x' })
    expect(asX.statusCode).toBe(201)
    const asY = await post(h, 'k-self', { url: '/self-auth', tenant: 'y' })
    expect(asY.statusCode).toBe(201)
    expect(replayed(asY)).toBe(false)
    const anon = await post(h, 'k-self', { url: '/self-auth', tenant: null })
    expect(anon.statusCode).toBe(401)
    expect(replayed(anon)).toBe(false)
    const xAgain = await post(h, 'k-self', { url: '/self-auth', tenant: 'x' })
    expect(replayed(xAgain)).toBe(true)
    expect(xAgain.json()).toEqual(asX.json())
    expect(h.calls()).toBe(2)
  })

  it('the same key on another connection (query string) is a conflict, not a replay of the other connection', async () => {
    const h = await build()
    expect((await post(h, 'k-q', { url: '/v1/things?connection_id=a' })).statusCode).toBe(201)
    const other = await post(h, 'k-q', { url: '/v1/things?connection_id=b' })
    expect(other.statusCode).toBe(422)
    expect(other.headers['idempotency-key-conflict']).toBe('true')
    expect(h.calls()).toBe(1)
  })

  it('a key reused with a different body answers 422 and leaves the original record intact', async () => {
    const h = await build()
    const first = await post(h, 'k-body', { body: { amount: 1 } })
    expect(first.statusCode).toBe(201)
    expect((await post(h, 'k-body', { body: { amount: 2 } })).statusCode).toBe(422)
    const original = await post(h, 'k-body', { body: { amount: 1 } })
    expect(original.statusCode).toBe(201)
    expect(replayed(original)).toBe(true)
    expect(original.json()).toEqual(first.json())
    expect(h.calls()).toBe(1)
  })
})

describe('Idempotency-Key: a claim is always settled', () => {
  it('a lost claim race answers 409 and never runs the handler a second time', async () => {
    // The race: our read saw no record, but another request claimed the key
    // before our NX set. The store answers the set with null, as ioredis does.
    const held = JSON.stringify({ marker: '__IN_FLIGHT__' })
    let firstRead = true
    const racing: IdempotencyStore = {
      async get() {
        if (firstRead) {
          firstRead = false
          return null
        }
        return held
      },
      async set(_key, _value, _mode, _seconds, flag) {
        return flag === 'NX' ? null : 'OK'
      },
      async del() {
        return 1
      },
    }
    const h = await build(racing)
    const res = await post(h, 'k-race')
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ code: 'idempotency_in_flight' })
    expect(h.calls()).toBe(0)
  })

  it('a streamed response is not stored, and its claim is released (no 24 h "in flight")', async () => {
    const h = await build()
    expect((await post(h, 'k-stream', { url: '/v1/stream' })).statusCode).toBe(200)
    const retry = await post(h, 'k-stream', { url: '/v1/stream' })
    expect(retry.statusCode).toBe(200)
    expect(replayed(retry)).toBe(false)
    expect(h.calls()).toBe(2)
  })

  it('a hijacked reply releases its claim', async () => {
    const h = await build()
    expect((await post(h, 'k-hijack', { url: '/v1/hijacked' })).statusCode).toBe(200)
    const retry = await post(h, 'k-hijack', { url: '/v1/hijacked' })
    expect(retry.statusCode).toBe(200)
    expect(retry.body).toBe('raw')
    expect(h.calls()).toBe(2)
  })
})
