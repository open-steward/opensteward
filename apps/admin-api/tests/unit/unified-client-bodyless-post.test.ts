/**
 * Regression: a POST issued with no `data` argument must still go on the wire
 * as `application/json`, whatever method issues it.
 *
 * axios labels a bodyless POST `Content-Type: application/x-www-form-urlencoded`
 * (with `Content-Length: 0`) and only switches to `application/json` once it is
 * handed an object. The integration-server registers no form-urlencoded parser,
 * so Fastify rejects the request with 415 FST_ERR_CTP_INVALID_MEDIA_TYPE before
 * any handler runs. The operator saw "Unsupported Media Type" on webhook test,
 * and — because rotate swallows its error — a bare "Failed to rotate secret".
 *
 * The earlier round of this bug was fixed call site by call site (see
 * unified-client-post-body.test.ts), which left the next bodyless POST free to
 * reintroduce it. The fix under test here is a property of the client, so these
 * tests assert the invariant as well as the three methods that were broken.
 *
 * The server below is a stock Fastify instance with no extra content-type
 * parsers — the same 415 behaviour as the integration-server — so the assertion
 * is on what the client actually put on the wire, not on a mock being called.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AxiosInstance } from 'axios'
import { UnifiedClient } from '../../src/core/proxy/client'

interface Seen {
  method: string
  url: string
  contentType?: string
  body: unknown
}

describe('UnifiedClient bodyless POSTs', () => {
  let server: FastifyInstance
  let client: UnifiedClient
  const seen: Seen[] = []

  beforeAll(async () => {
    server = Fastify({ logger: false })

    // Records what arrived. A request whose content-type has no parser never
    // gets here: Fastify answers 415 first, which is exactly the production
    // failure this suite is guarding.
    const record =
      (payload: unknown) =>
      async (request: {
        method: string
        url: string
        headers: Record<string, unknown>
        body: unknown
      }) => {
        seen.push({
          method: request.method,
          url: request.url,
          contentType: request.headers['content-type'] as string | undefined,
          body: request.body,
        })
        return { data: payload }
      }

    server.post(
      '/admin/webhook-subscriptions/:id/test',
      record({ id: 'sub_1', ok: true, status: 200 }),
    )
    server.post(
      '/admin/webhook-subscriptions/:id/rotate-secret',
      record({ id: 'sub_1', secret: 'whsec_new' }),
    )
    server.post(
      '/admin/webhook-subscriptions/:id/deliveries/:deliveryId/replay',
      record({ id: 'dlv_1', status: 'pending' }),
    )
    server.post('/admin/end-users', record({ id: 'eu_1' }))
    server.get('/health', record({ status: 'ok' }))
    // Stands in for a bodyless POST added to the client after this fix.
    server.post('/some/route/added/later', record({ ok: true }))

    const address = await server.listen({ port: 0, host: '127.0.0.1' })
    client = new UnifiedClient({ url: address })
  })

  afterAll(async () => {
    await server.close()
  })

  function hitFor(fragment: string): Seen | undefined {
    return seen.find((s) => s.url.includes(fragment))
  }

  it('testWebhookSub reaches the handler as application/json', async () => {
    const data = await client.testWebhookSub('sub_1')

    const hit = hitFor('/test')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toMatch(/^application\/json/)
    expect(data).toMatchObject({ ok: true })
  })

  it('rotateWebhookSubSecret returns the new secret instead of swallowing a 415', async () => {
    // The pre-fix symptom: the 415 landed in the catch and the operator got
    // "Failed to rotate secret" with no cause, so assert the value too.
    const secret = await client.rotateWebhookSubSecret('sub_1')

    expect(secret).toBe('whsec_new')
    const hit = hitFor('/rotate-secret')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toMatch(/^application\/json/)
  })

  it('replayWebhookDelivery reaches the handler as application/json', async () => {
    const data = await client.replayWebhookDelivery('sub_1', 'dlv_1')

    expect(data).not.toBeNull()
    const hit = hitFor('/replay')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toMatch(/^application\/json/)
  })

  it('applies to any bodyless POST on the instance, not just the known call sites', async () => {
    // Reaches past the named methods on purpose: the guarantee has to hold for
    // a method someone adds later without knowing about this bug.
    const axiosInstance = (client as unknown as { client: AxiosInstance }).client
    await axiosInstance.post('/some/route/added/later')

    const hit = hitFor('/added/later')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toMatch(/^application\/json/)
    expect(hit!.body).toEqual({})
  })

  it('leaves a POST that has a real body alone', async () => {
    await client.createEndUser({ email: 'ops@example.com' })

    const hit = hitFor('/admin/end-users')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toMatch(/^application\/json/)
    expect(hit!.body).toEqual({ email: 'ops@example.com' })
  })

  it('does not put a body on a GET', async () => {
    await client.getHealth()

    const hit = hitFor('/health')
    expect(hit).toBeDefined()
    expect(hit!.contentType).toBeUndefined()
  })
})
