/**
 * Which requests need `vertical:write`.
 *
 * The default rule is the HTTP verb: anything that is not GET/HEAD under
 * `/v1/{vertical}/*` demands `vertical:write`. `POST /v1/{vertical}/sync` is
 * the exception — it pulls upstream data into OpenSteward's own store and
 * never writes anything back to the platform. The scope's stated purpose — in
 * the comment above the check — is that a read key "can read upstream data
 * without being able to push writes back", and a sync pushes nothing.
 *
 * The practical consequence: `SAFE_DEFAULT_SCOPES` deliberately omits
 * `vertical:write`, so a developer who accepted the recommended preset would
 * be able to read `/v1/accounting/invoices` but not refresh the cache those
 * reads are served from if sync were write-gated.
 *
 * A route opts out of the verb rule with `config: { readSafe: true }`, which
 * is deliberately explicit: the default treats every non-GET as a write, so a
 * new mutating route is write-gated unless someone says otherwise.
 */
import { describe, it, expect } from 'vitest'
import { requiresWriteScope } from '../../src/control-plane/auth-middleware'

describe('requiresWriteScope', () => {
  it('treats reads as reads', () => {
    expect(requiresWriteScope('GET', undefined)).toBe(false)
    expect(requiresWriteScope('HEAD', undefined)).toBe(false)
  })

  it('treats every other verb as a write by default', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(requiresWriteScope(method, undefined), method).toBe(true)
    }
  })

  it('exempts a route that declares itself read-safe', () => {
    expect(requiresWriteScope('POST', { readSafe: true })).toBe(false)
  })

  it('does not exempt a route that merely has some other config', () => {
    expect(requiresWriteScope('POST', { rateLimit: { max: 5 } } as Record<string, unknown>)).toBe(
      true,
    )
  })

  it('requires the flag to be exactly true, not merely truthy', () => {
    // A stray string from config plumbing must not silently open a write path.
    expect(
      requiresWriteScope('POST', { readSafe: 'yes' } as unknown as { readSafe?: boolean }),
    ).toBe(true)
  })
})

describe('route config visibility from a preHandler hook', () => {
  it('exposes readSafe to a hook registered before the route, which is how the middleware reads it', async () => {
    // The auth middleware runs as `app.addHook('preHandler', ...)` on the
    // vertical plugin, registered BEFORE the sync router. If Fastify did not
    // expose the matched route's config there, the opt-out would be silently
    // inert and sync would keep 403ing read-only keys — the failure mode this
    // whole change exists to remove.
    const Fastify = (await import('fastify')).default
    const app = Fastify({ logger: false })
    const seen: Array<unknown> = []
    app.addHook('preHandler', async (request) => {
      seen.push((request.routeOptions?.config as { readSafe?: unknown } | undefined)?.readSafe)
    })
    app.post('/sync', { config: { readSafe: true } }, async () => ({ ok: true }))
    app.post('/invoices', async () => ({ ok: true }))
    await app.ready()

    await app.inject({ method: 'POST', url: '/sync' })
    await app.inject({ method: 'POST', url: '/invoices' })
    await app.close()

    expect(seen).toEqual([true, undefined])
  })
})
