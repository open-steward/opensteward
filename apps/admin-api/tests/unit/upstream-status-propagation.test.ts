/**
 * admin-api must not flatten an upstream status into a 500.
 *
 * Its error handler derives the response status from `err.statusCode`
 * (openapi-setup.ts). An AxiosError does not have that property — it carries
 * `status` and `response.status` — so every failure of a proxied call to
 * integration-server came back as 500, whatever the real cause. When the
 * integration-server rate limiter answered 429, the admin UI received
 * `500 / "Request failed with status code 429"`: the wrong status, no
 * Retry-After, and nothing naming the origin.
 *
 * A 429 must stay a 429 and keep its Retry-After, so the caller can back off
 * instead of treating a throttle as a server fault.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'

let app: FastifyInstance

/** Shaped exactly like what axios throws on a non-2xx upstream response. */
function axiosError(status: number, retryAfter?: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    name: 'AxiosError',
    isAxiosError: true,
    code: status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    status,
    response: {
      status,
      headers: retryAfter ? { 'retry-after': retryAfter } : {},
      data: { error: 'Rate limit exceeded, retry in 10 seconds' },
    },
  })
}

beforeEach(async () => {
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  app.get('/throttled', async () => {
    throw axiosError(429, '10')
  })
  app.get('/upstream-500', async () => {
    throw axiosError(502)
  })
  app.get('/local-failure', async () => {
    throw new Error('something genuinely broke here')
  })
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

describe('upstream error status propagation', () => {
  it('passes an upstream 429 through instead of reporting 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/throttled' })
    expect(res.statusCode).toBe(429)
  })

  it('keeps Retry-After so the caller can back off', async () => {
    const res = await app.inject({ method: 'GET', url: '/throttled' })
    expect(res.headers['retry-after']).toBe('10')
  })

  it('reports the upstream message rather than an axios status string', async () => {
    const res = await app.inject({ method: 'GET', url: '/throttled' })
    expect(res.json().error).toBe('Rate limit exceeded, retry in 10 seconds')
  })

  it('passes an upstream 502 through as 502', async () => {
    const res = await app.inject({ method: 'GET', url: '/upstream-500' })
    expect(res.statusCode).toBe(502)
  })

  it('still reports a genuine local failure as 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/local-failure' })
    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('something genuinely broke here')
  })
})
