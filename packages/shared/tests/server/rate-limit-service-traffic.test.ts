/**
 * Trusted service-to-service traffic must not share the anonymous per-IP bucket.
 *
 * The limiter keys on `req.ip`. admin-api reaches integration-server from a
 * single container IP and sends no X-Forwarded-For, so *every* admin-UI page
 * view by *every* operator counts against one bucket. With the shipped
 * 100/60s that is roughly ten page views a minute: loading the Connect Links
 * page after creating a link is enough to 429 the operator's own admin UI.
 *
 * Requests presenting the deployment's ADMIN_SECRET are the operator's own
 * control plane, already authenticated by `adminGuard`. The per-IP limiter
 * exists to blunt anonymous abuse from the internet; applying it to a trusted
 * sibling service only lets the stack throttle itself. Anonymous traffic —
 * the connect flow, the public API — stays limited.
 */
import { describe, it, expect, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createBaseServer } from '../../src/server/create-server'

const SECRET = 'admin-secret-value-used-by-sibling-services'
let app: FastifyInstance

async function build(config?: { rateLimitAllowSecret?: string }): Promise<FastifyInstance> {
  app = await createBaseServer({
    logger: false,
    rateLimitMax: 3,
    rateLimitWindow: 60_000,
    rateLimitAllowSecret: config?.rateLimitAllowSecret,
  })
  app.get('/admin/platforms', async () => ({ ok: true }))
  app.get('/v1/customers', async () => ({ ok: true }))
  await app.ready()
  return app
}

/** Fire n requests from one source IP and return the statuses. */
async function fire(
  instance: FastifyInstance,
  n: number,
  headers: Record<string, string> = {},
  url = '/admin/platforms',
): Promise<number[]> {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const res = await instance.inject({ method: 'GET', url, headers, remoteAddress: '172.19.0.5' })
    out.push(res.statusCode)
  }
  return out
}

afterEach(async () => {
  await app?.close()
})

describe('rate limiting of trusted service traffic', () => {
  it('does not throttle requests carrying the deployment admin secret', async () => {
    const instance = await build({ rateLimitAllowSecret: SECRET })
    const statuses = await fire(instance, 6, { 'x-admin-secret': SECRET })
    expect(statuses.every((s) => s === 200)).toBe(true)
  })

  it('still throttles anonymous traffic from the same IP', async () => {
    const instance = await build({ rateLimitAllowSecret: SECRET })
    const statuses = await fire(instance, 6, {}, '/v1/customers')
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200])
    expect(statuses.slice(3)).toEqual([429, 429, 429])
  })

  it('throttles a wrong secret exactly like no secret at all', async () => {
    const instance = await build({ rateLimitAllowSecret: SECRET })
    const statuses = await fire(instance, 6, { 'x-admin-secret': 'not-the-secret' })
    expect(statuses).toContain(429)
  })

  it('exempts nothing when the deployment configures no secret', async () => {
    const instance = await build({})
    const statuses = await fire(instance, 6, { 'x-admin-secret': SECRET })
    expect(statuses).toContain(429)
  })
})
