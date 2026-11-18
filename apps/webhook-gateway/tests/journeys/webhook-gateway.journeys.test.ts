/**
 * User-journey regression tests for the webhook-gateway (the central inbound
 * webhook receiver).
 *
 * The stories follow a platform sending us a webhook and an operator looking
 * after the delivery pipeline: a webhook that forwards cleanly, one that fails
 * and is queued for retry, and a dead-lettered delivery that an operator
 * inspects and replays. A red test means the durability guarantees slipped.
 *
 * In-process: the real gateway over a throwaway SQLite db, forwarding to a
 * controllable http stub. See ./helpers.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildGatewayTestServer,
  startUpstreamStub,
  type GatewayTestServer,
  type UpstreamStub,
} from './helpers'

let stub: UpstreamStub
let gw: GatewayTestServer

beforeEach(async () => {
  stub = await startUpstreamStub()
  gw = await buildGatewayTestServer(stub.url)
})

afterEach(async () => {
  await gw?.cleanup()
  await stub?.close()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: A platform sends a webhook and it is delivered to the vertical', () => {
  it('forwards the webhook upstream and records it as delivered', async () => {
    const res = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/acme',
      headers: { 'content-type': 'application/json' },
      payload: { event: 'shipment.created', id: 'shp_1' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('delivered')

    // The upstream actually received the payload.
    expect(stub.received).toHaveLength(1)
    expect((stub.received[0] as { id?: string }).id).toBe('shp_1')

    // And the delivery is durably logged as delivered.
    const delivery = await gw.deliveryStore.getDelivery(res.json().deliveryId)
    expect(delivery?.status).toBe('delivered')
  })

  it('a webhook for an unknown platform is rejected', async () => {
    const res = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/not-configured',
      headers: { 'content-type': 'application/json' },
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: When the vertical is down, a webhook is not lost', () => {
  it('a failed forward is queued for retry rather than dropped', async () => {
    stub.setStatus(500)
    const res = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/acme',
      headers: { 'content-type': 'application/json' },
      payload: { event: 'shipment.created', id: 'shp_2' },
    })
    expect(res.statusCode).toBe(202)
    expect(res.json().status).toBe('queued_for_retry')

    const delivery = await gw.deliveryStore.getDelivery(res.json().deliveryId)
    expect(delivery?.status).toBe('failed')
    expect(delivery?.attempts).toBe(1)
    // It is scheduled for a future retry rather than abandoned.
    expect(delivery?.next_retry_at).toBeGreaterThan(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Journey: An operator inspects the dead-letter queue and replays a delivery', () => {
  const ADMIN_SECRET = 'operator-admin-secret'

  it('the DLQ and log endpoints are gated by the admin secret', async () => {
    vi.stubEnv('ADMIN_SECRET', ADMIN_SECRET)

    const denied = await gw.fastify.inject({ method: 'GET', url: '/webhooks/dlq' })
    expect(denied.statusCode).toBe(403)

    const allowed = await gw.fastify.inject({
      method: 'GET',
      url: '/webhooks/dlq',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('a dead-lettered delivery can be inspected and replayed against a healthy vertical', async () => {
    vi.stubEnv('ADMIN_SECRET', ADMIN_SECRET)

    // Arrange: drive a delivery into the DLQ by exhausting its retry budget.
    const id = await gw.deliveryStore.createDelivery(
      'acme',
      'logistics',
      `${stub.url}/webhooks/acme`,
      Buffer.from(JSON.stringify({ event: 'shipment.created', id: 'shp_dlq' })),
      {},
    )
    for (let i = 0; i < 6; i++) {
      await gw.deliveryStore.markFailed(id, 500, 'HTTP 500')
    }
    expect((await gw.deliveryStore.getDelivery(id))?.status).toBe('dlq')

    // The operator sees it in the DLQ.
    const dlq = await gw.fastify.inject({
      method: 'GET',
      url: '/webhooks/dlq',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    })
    expect((dlq.json().data as Array<{ id: string }>).some((d) => d.id === id)).toBe(true)

    // The operator replays it.
    const replay = await gw.fastify.inject({
      method: 'POST',
      url: `/webhooks/dlq/${id}/retry`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    })
    expect(replay.statusCode).toBe(200)
    expect((await gw.deliveryStore.getDelivery(id))?.status).toBe('failed')

    // The retry worker, against a now-healthy vertical, delivers it.
    stub.setStatus(200)
    await gw.retryWorker.process()
    expect((await gw.deliveryStore.getDelivery(id))?.status).toBe('delivered')
    expect((stub.received[stub.received.length - 1] as { id?: string }).id).toBe('shp_dlq')
  })

  it('replaying a delivery that is not in the DLQ returns 404', async () => {
    vi.stubEnv('ADMIN_SECRET', ADMIN_SECRET)
    const res = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/dlq/does-not-exist/retry',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Journey: a signed webhook reaches the vertical exactly as the platform sent it', () => {
  it('relays the raw bytes, not a re-serialised JSON object', async () => {
    const body = '{"b":1,  "a":"\\u00e9",\n"n":1.0}'
    const res = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/acme',
      headers: { 'content-type': 'application/json' },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    expect(stub.raw[0]!.equals(Buffer.from(body))).toBe(true)
  })

  it('relays every signature header and none of the unsafe ones', async () => {
    const res = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        'intuit-signature': 'q1',
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1700000000',
        'webhook-signature': 'v1,abc',
        cookie: 'session=1',
        'x-admin-secret': 'nope',
        'x-forwarded-for': '6.6.6.6',
      },
      payload: '{}',
    })
    expect(res.statusCode).toBe(200)
    const h = stub.headers[0]!
    expect(h['intuit-signature']).toBe('q1')
    expect(h['webhook-id']).toBe('msg_1')
    expect(h['webhook-timestamp']).toBe('1700000000')
    expect(h['webhook-signature']).toBe('v1,abc')
    expect(h['cookie']).toBeUndefined()
    expect(h['x-admin-secret']).toBeUndefined()
    expect(h['x-forwarded-for']).toBeUndefined()
  })

  it.each([
    ['application/x-www-form-urlencoded', 'a=1&b=%C3%A9'],
    ['text/xml', '<?xml version="1.0"?><n a="1"/>'],
  ])('relays a %s body unchanged', async (type, body) => {
    const res = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/acme',
      headers: { 'content-type': type },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    expect(stub.raw[0]!.toString('utf8')).toBe(body)
    expect(stub.headers[0]!['content-type']).toBe(type)
  })

  it('queues for retry when the vertical is unreachable', async () => {
    await stub.close() // connection refused on the next forward
    const res = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/acme',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })
    expect(res.statusCode).toBe(202)
    expect(res.json().status).toBe('queued_for_retry')
  })
})

describe('Journey: a retried delivery is the same delivery', () => {
  it('replays the exact bytes and signature headers once the vertical recovers', async () => {
    stub.setStatus(500)
    const body = '{"z":0,  "a":1}'
    await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/acme',
      headers: { 'content-type': 'application/json', 'intuit-signature': 'q1' },
      payload: body,
    })
    stub.setStatus(200)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_000)
    await gw.retryWorker.process()
    vi.useRealTimers()
    const last = stub.raw.length - 1
    expect(stub.raw[last]!.toString('utf8')).toBe(body)
    expect(stub.headers[last]!['intuit-signature']).toBe('q1')
  })
})

describe('Journey: an operator reads the log and DLQ without seeing the credentials a platform sent', () => {
  const ADMIN_SECRET = 'operator-admin-secret'
  // Some platforms authenticate webhooks with HTTP Basic auth; the gateway
  // relays that header (forwardableHeaders keeps it) and stores it for replay.
  const AUTHORIZATION = `Basic ${Buffer.from('hook-user:hook-pass-7f3a').toString('base64')}`
  const SIGNATURE = 'v1,sig-value-9c2e'
  const BODY = '{"event":"shipment.created","id":"shp_redact"}'

  it('log and DLQ list header names only, and a retry still replays the original headers', async () => {
    vi.stubEnv('ADMIN_SECRET', ADMIN_SECRET)

    // A webhook arrives while the vertical is down, then exhausts its retries.
    stub.setStatus(500)
    const sent = await gw.fastify.inject({
      method: 'POST',
      url: '/webhooks/acme',
      headers: {
        'content-type': 'application/json',
        authorization: AUTHORIZATION,
        'webhook-signature': SIGNATURE,
      },
      payload: BODY,
    })
    expect(sent.statusCode).toBe(202)
    const id = sent.json().deliveryId as string
    for (let i = 0; i < 5; i++) await gw.deliveryStore.markFailed(id, 500, 'HTTP 500')
    expect((await gw.deliveryStore.getDelivery(id))?.status).toBe('dlq')

    // The stored row really does hold the secrets, so the checks below bite.
    const stored = await gw.deliveryStore.getDelivery(id)
    expect(stored?.headers_json).toContain(AUTHORIZATION)
    expect(stored?.payload_b64).toBe(Buffer.from(BODY).toString('base64'))

    for (const url of ['/webhooks/log', '/webhooks/dlq']) {
      const res = await gw.fastify.inject({
        method: 'GET',
        url,
        headers: { 'x-admin-secret': ADMIN_SECRET },
      })
      expect(res.statusCode).toBe(200)
      const rows = res.json().data as Array<Record<string, unknown>>
      const row = rows.find((r) => r.id === id)
      expect(row, url).toBeDefined()
      expect(row, url).not.toHaveProperty('payload_b64')
      expect(row, url).not.toHaveProperty('headers_json')
      // Names only (inject adds its own user-agent, hence arrayContaining).
      const names = row!.headerNames as string[]
      expect(names, url).toEqual(
        expect.arrayContaining(['authorization', 'content-type', 'webhook-signature']),
      )
      expect(names, url).toEqual([...names].sort())
      // Nowhere in the response body, under any key.
      expect(res.body, url).not.toContain(AUTHORIZATION)
      expect(res.body, url).not.toContain('hook-pass-7f3a')
      expect(res.body, url).not.toContain(SIGNATURE)
      expect(res.body, url).not.toContain(Buffer.from(BODY).toString('base64'))
    }

    // The operator replays it; the worker still reads the full stored row.
    const replay = await gw.fastify.inject({
      method: 'POST',
      url: `/webhooks/dlq/${id}/retry`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    })
    expect(replay.statusCode).toBe(200)
    stub.setStatus(200)
    const before = stub.headers.length
    await gw.retryWorker.process()
    expect((await gw.deliveryStore.getDelivery(id))?.status).toBe('delivered')
    expect(stub.headers.length).toBe(before + 1)
    const last = stub.headers.length - 1
    expect(stub.headers[last]!['authorization']).toBe(AUTHORIZATION)
    expect(stub.headers[last]!['webhook-signature']).toBe(SIGNATURE)
    expect(stub.raw[last]!.toString('utf8')).toBe(BODY)
  })

  it('a row written before the relay columns existed lists no header names', async () => {
    vi.stubEnv('ADMIN_SECRET', ADMIN_SECRET)
    const id = await gw.deliveryStore.createDelivery(
      'acme',
      'logistics',
      `${stub.url}/webhooks/acme`,
      Buffer.from('{}'),
      { authorization: AUTHORIZATION },
    )
    await gw.deliveryStore.clearRelayColumnsForTest(id)
    const res = await gw.fastify.inject({
      method: 'GET',
      url: '/webhooks/log',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    })
    const row = (res.json().data as Array<Record<string, unknown>>).find((r) => r.id === id)
    expect(row!.headerNames).toEqual([])
  })
})
