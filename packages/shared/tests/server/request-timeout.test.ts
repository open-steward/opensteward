import { describe, it, expect, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createBaseServer } from '../../src/server/create-server'

/**
 * Finding 21 / Finding 7 (second half) — no handler may block indefinitely.
 *
 * Finding 7 reported two things: one endpoint that hung, and the absence of
 * any timeout budget. The endpoint was fixed and the budget was not, so the
 * hang reappeared at a different endpoint with the same undiagnosable symptom:
 * a silent four-minute void with no status, no log line and no error.
 *
 * A bounded failure is required REGARDLESS of cause. This is the guarantee
 * that makes the next unknown stall diagnosable instead of invisible, and it
 * is deliberately at the server level rather than in any adapter — there are
 * 1,545 adapters and 592 of them build an HTTP client with no timeout at all.
 *
 * Note what Fastify's own `requestTimeout` does NOT do: it bounds the time
 * spent RECEIVING a request from the client, not the time a handler spends
 * running. A handler awaiting a socket that never answers is unaffected by it.
 * That is why this is a hook with its own timer.
 */

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const never = () => new Promise<never>(() => {})

describe('handler timeout budget', () => {
  it('answers 504 when a handler never returns', async () => {
    app = await createBaseServer({ handlerTimeoutMs: 300 })
    app.get('/hang', async () => never())

    const res = await app.inject({ method: 'GET', url: '/hang' })
    expect(res.statusCode).toBe(504)
  })

  it('uses the typed error envelope rather than a bare status', async () => {
    app = await createBaseServer({ handlerTimeoutMs: 300 })
    app.get('/hang', async () => never())

    const body = (await app.inject({ method: 'GET', url: '/hang' })).json()
    expect(body.error.code).toBe('REQUEST_TIMEOUT')
    // The message has to say whose fault it is, like the rest of the taxonomy.
    expect(body.error.message).toMatch(/timed out/i)
    expect(body.error.timeoutMs).toBe(300)
  })

  it('fails within the budget, not merely eventually', async () => {
    app = await createBaseServer({ handlerTimeoutMs: 300 })
    app.get('/hang', async () => never())

    const t0 = Date.now()
    await app.inject({ method: 'GET', url: '/hang' })
    const elapsed = Date.now() - t0
    // Generous ceiling — the assertion is "bounded", not "precise".
    expect(elapsed).toBeLessThan(3000)
  })

  it('does not interfere with a handler that answers in time', async () => {
    app = await createBaseServer({ handlerTimeoutMs: 2000 })
    app.get('/ok', async () => ({ ok: true }))

    const res = await app.inject({ method: 'GET', url: '/ok' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('does not truncate a slow but finite handler that beats the budget', async () => {
    app = await createBaseServer({ handlerTimeoutMs: 1500 })
    app.get('/slow', async () => {
      await new Promise((r) => setTimeout(r, 200))
      return { ok: true }
    })

    const res = await app.inject({ method: 'GET', url: '/slow' })
    expect(res.statusCode).toBe(200)
  })

  it('never sends twice when the handler returns just after the timeout fired', async () => {
    // The race that makes naive versions of this crash with
    // ERR_HTTP_HEADERS_SENT and turn a timeout into a 500.
    app = await createBaseServer({ handlerTimeoutMs: 100 })
    app.get('/late', async () => {
      await new Promise((r) => setTimeout(r, 400))
      return { ok: true }
    })

    const res = await app.inject({ method: 'GET', url: '/late' })
    expect(res.statusCode).toBe(504)
    await new Promise((r) => setTimeout(r, 400))
  })

  it('is off unless a budget is configured, so embedders opt in deliberately', async () => {
    app = await createBaseServer({})
    app.get('/ok', async () => ({ ok: true }))
    expect((await app.inject({ method: 'GET', url: '/ok' })).statusCode).toBe(200)
  })
})
