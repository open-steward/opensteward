/**
 * Calling a CRM tool against an accounting connection is not "not implemented".
 *
 * An MCP sweep called `list_deals` (CRM) with an accounting connection id and
 * got **501**, indistinguishable from `list_tax_rates` — where the entity IS in
 * the connection's vertical and simply has no Fortnox mapping. A client cannot
 * tell "never call this again for this connection" from "this may work once we
 * ship the mapping", so it retries forever or gives up on both.
 *
 * The cause is that nothing compares the two verticals. `createUnifiedAuthMiddleware`
 * is a single shared instance mounted by every vertical plugin, so it cannot know
 * which route the request landed on; it resolves the adapter purely from the
 * CONNECTION row's vertical and attaches it. The CRM router then runs its ordinary
 * `!adapter.listDeals` guard against an accounting adapter and reports 501 —
 * the same code path that legitimately means "unmapped for this platform".
 *
 * `attachDataStoreContext` is where both facts exist: it runs after the auth
 * middleware (so the connection's vertical is on the request) and it knows the
 * vertical its own plugin was mounted with. It previously overwrote the former
 * with the latter, destroying the only evidence of a mismatch.
 */
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { attachDataStoreContext } from '../../src/data-store/attach-context'

/** Mounts a vertical plugin whose auth step resolved `connectionVertical`. */
async function buildApp(opts: { mountedVertical: string; connectionVertical?: string }) {
  const app = Fastify({ logger: false })
  await app.register(async (scope) => {
    // Stand-in for createUnifiedAuthMiddleware, which attaches the connection
    // row's vertical before any vertical-specific hook runs.
    scope.addHook('preHandler', async (request) => {
      if (opts.connectionVertical) {
        ;(request as unknown as Record<string, unknown>)['vertical'] = opts.connectionVertical
      }
    })
    attachDataStoreContext(scope, { vertical: opts.mountedVertical, mode: 'passthrough' })
    scope.get('/deals', async (request) => ({
      reached: true,
      vertical: (request as unknown as Record<string, unknown>)['vertical'],
    }))
  })
  await app.ready()
  return app
}

describe('a connection from another vertical is refused, not reported unimplemented', () => {
  it('refuses an accounting connection on a CRM route', async () => {
    const app = await buildApp({ mountedVertical: 'crm', connectionVertical: 'accounting' })
    const res = await app.inject({ method: 'GET', url: '/deals' })
    const body = JSON.parse(res.payload)

    expect(res.statusCode).toBe(400)
    expect(body.error.code).toBe('VERTICAL_MISMATCH')
    await app.close()
  })

  it('names both verticals, so the client knows which pairing was wrong', async () => {
    const app = await buildApp({ mountedVertical: 'crm', connectionVertical: 'accounting' })
    const res = await app.inject({ method: 'GET', url: '/deals' })
    const message = JSON.parse(res.payload).error.message

    expect(message).toContain('accounting')
    expect(message).toContain('crm')
    await app.close()
  })

  it('never reaches the route handler, so no 501 can be produced', async () => {
    const app = await buildApp({ mountedVertical: 'crm', connectionVertical: 'accounting' })
    const res = await app.inject({ method: 'GET', url: '/deals' })

    expect(JSON.parse(res.payload).reached).toBeUndefined()
    await app.close()
  })

  it('allows a matching vertical through untouched', async () => {
    const app = await buildApp({ mountedVertical: 'accounting', connectionVertical: 'accounting' })
    const res = await app.inject({ method: 'GET', url: '/deals' })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).reached).toBe(true)
    await app.close()
  })

  it('allows routes that resolved no connection at all', async () => {
    // Not every route in a vertical plugin takes a connection_id — a platform
    // catalogue listing, for one. Absent is not a mismatch.
    const app = await buildApp({ mountedVertical: 'accounting' })
    const res = await app.inject({ method: 'GET', url: '/deals' })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).vertical).toBe('accounting')
    await app.close()
  })
})
