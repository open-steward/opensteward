import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHmac } from 'crypto'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { WebhookSubscriptionStore } from '../../src/auth/webhook-subscriptions'
import { emitTenantEvent } from '../../src/control-plane/event-emitter'
import { WebhookDeliveryStore } from '../../src/auth/webhook-deliveries'

const SECRET = 'test-secret-must-be-at-least-32-chars!'

describe('emitTenantEvent', () => {
  let handle: DbHandle | undefined
  let store: WebhookSubscriptionStore

  afterEach(async () => {
    // The store is a borrower — close the shared handle, not the store.
    await handle?.close()
    handle = undefined
  })

  async function open() {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await WebhookSubscriptionStore.create(handle, SECRET)
    return store
  }

  it('signs the body with the per-subscription secret and posts to the URL', async () => {
    const s = await open()
    const sub = await s.create({
      tenantId: 't',
      url: 'https://example.test/hook',
      events: ['customer.created'],
    })
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response('ok', { status: 202 })
    }) as unknown as typeof fetch

    const env = await emitTenantEvent(
      s,
      't',
      'customer.created',
      { id: 'c1', tenantId: 't', email: 'jane@example.com' },
      { fetchImpl },
    )

    expect(env.type).toBe('customer.created')
    // delivery happens asynchronously — give it a tick.
    await new Promise((r) => setTimeout(r, 30))
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://example.test/hook')
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>
    expect(headers['x-oi-event']).toBe('customer.created')
    const expected = createHmac('sha256', sub.secret)
      .update(calls[0].init.body as string)
      .digest('hex')
    expect(headers['x-oi-signature']).toBe(`sha256=${expected}`)

    // Allow recordResult to flush.
    await new Promise((r) => setTimeout(r, 30))
    expect((await s.list('t'))[0].lastStatus).toBe(202)
  })

  it('does nothing when no subscription matches', async () => {
    const s = await open()
    await s.create({ tenantId: 't', url: 'https://example.test/x', events: ['connect_link.consumed'] })
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await emitTenantEvent(s, 't', 'customer.created', { x: 1 }, { fetchImpl })
    await new Promise((r) => setTimeout(r, 10))
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it('records error when delivery throws', async () => {
    const s = await open()
    await s.create({ tenantId: 't', url: 'https://example.test/x' })
    const fetchImpl = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    await emitTenantEvent(s, 't', 'customer.created', {}, { fetchImpl })
    await new Promise((r) => setTimeout(r, 30))
    const after = (await s.list('t'))[0]
    expect(after.lastStatus).toBeNull()
    expect(after.lastError).toBe('network down')
  })

  describe('per-subscription format', () => {
    it('renders each subscription in its own format from one event', async () => {
      const s = await open()
      await s.create({ tenantId: 't', url: 'https://plain.test/hook' })
      await s.create({ tenantId: 't', url: 'https://slack.test/hook', format: 'slack' })

      const calls: Array<{ url: string; init: RequestInit }> = []
      const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return { status: 200 } as Response
      }) as unknown as typeof fetch

      await emitTenantEvent(s, 't', 'customer.created', { id: 'e-1' }, { fetchImpl })
      await new Promise((r) => setTimeout(r, 30))

      expect(calls).toHaveLength(2)
      const plain = JSON.parse(
        calls.find((c) => c.url.includes('plain'))!.init.body as string,
      ) as Record<string, unknown>
      const slack = JSON.parse(
        calls.find((c) => c.url.includes('slack'))!.init.body as string,
      ) as Record<string, unknown>

      expect(plain.type).toBe('customer.created')
      expect(plain.data).toEqual({ id: 'e-1' })
      expect(slack.text).toBeTypeOf('string')
      expect(slack.blocks).toBeInstanceOf(Array)
    })

    it('signs the rendered bytes, not the envelope, for a non-default format', async () => {
      const s = await open()
      const sub = await s.create({
        tenantId: 't',
        url: 'https://slack.test/hook',
        format: 'slack',
      })
      const calls: Array<{ init: RequestInit }> = []
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        calls.push({ init })
        return { status: 200 } as Response
      }) as unknown as typeof fetch

      await emitTenantEvent(s, 't', 'customer.created', { id: 'e-1' }, { fetchImpl })
      await new Promise((r) => setTimeout(r, 30))

      const headers = (calls[0].init.headers ?? {}) as Record<string, string>
      const body = calls[0].init.body as string
      const expected = createHmac('sha256', sub.secret).update(body).digest('hex')
      expect(headers['x-oi-signature']).toBe(`sha256=${expected}`)
    })

    it('persists the rendered body so a retry replays the same bytes', async () => {
      const s = await open()
      const deliveries = await WebhookDeliveryStore.create(handle!)
      await s.create({ tenantId: 't', url: 'https://slack.test/hook', format: 'slack' })
      const fetchImpl = (async () => ({ status: 500 }) as Response) as unknown as typeof fetch

      await emitTenantEvent(s, 't', 'customer.created', { id: 'e-1' }, { fetchImpl, deliveries })
      await new Promise((r) => setTimeout(r, 30))

      // The failed inline attempt schedules the next try 5s out, so look
      // past that window rather than at 'now'.
      const [queued] = await deliveries.nextBatch(10, Date.now() + 10_000)
      const stored = JSON.parse(queued.body) as Record<string, unknown>
      expect(stored.blocks).toBeInstanceOf(Array)
    })
  })

  describe('custom headers', () => {
    it('sends the subscription headers alongside the built-in ones', async () => {
      const s = await open()
      await s.create({
        tenantId: 't',
        url: 'https://example.test/hook',
        headers: { 'X-Api-Key': 'k-123' },
      })
      const calls: Array<{ init: RequestInit }> = []
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        calls.push({ init })
        return { status: 200 } as Response
      }) as unknown as typeof fetch

      await emitTenantEvent(s, 't', 'customer.created', {}, { fetchImpl })
      await new Promise((r) => setTimeout(r, 30))

      const headers = (calls[0].init.headers ?? {}) as Record<string, string>
      expect(headers['X-Api-Key']).toBe('k-123')
      expect(headers['x-oi-event']).toBe('customer.created')
    })

    it('cannot displace the signature header even if one is stored', async () => {
      // validateHeaders() rejects x-oi-* at the API boundary. This asserts the
      // second line of defence: even a row that got past it loses to the
      // built-in headers at delivery time.
      const s = await open()
      await s.create({
        tenantId: 't',
        url: 'https://example.test/hook',
        headers: { 'x-oi-signature': 'sha256=forged', 'content-type': 'text/plain' },
      })
      const calls: Array<{ init: RequestInit }> = []
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        calls.push({ init })
        return { status: 200 } as Response
      }) as unknown as typeof fetch

      await emitTenantEvent(s, 't', 'customer.created', {}, { fetchImpl })
      await new Promise((r) => setTimeout(r, 30))

      const headers = (calls[0].init.headers ?? {}) as Record<string, string>
      expect(headers['x-oi-signature']).not.toBe('sha256=forged')
      expect(headers['x-oi-signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
      expect(headers['content-type']).toBe('application/json')
    })
  })
})
