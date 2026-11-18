/**
 * The SDK's URLs against the real router.
 *
 * The public client's own unit tests can only check the URL it builds against
 * assumptions about the routes, and a substring assertion like
 * `url.toContain('/customers')` passes on a wrongly-joined path — the spec
 * strips `/v1/` from versioned path keys, so a client that joins `baseUrl`
 * to the stripped key builds a URL every versioned route 404s.
 *
 * So this drives the real `createPublicClient` through the real Fastify
 * instance. Nothing here mocks a route; `fetch` is redirected into
 * `fastify.inject`, so a path the SDK gets wrong is a 404 from the router
 * that actually serves it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createPublicClient, basePathFor } from '@opensteward/sdk'
import { sandboxConnectionId } from '@opensteward/shared'
import { buildTestServer, type TestServer } from './helpers'

describe('SDK against the real router', () => {
  let server: TestServer
  let live: string
  let test: string
  let injectFetch: typeof globalThis.fetch

  beforeAll(async () => {
    server = await buildTestServer()
    live = (await server.apiKeys.mint({ tenantId: 'default', scopes: ['*'], mode: 'live' }))
      .plaintext
    test = (await server.apiKeys.mint({ tenantId: 'default', scopes: ['*'], mode: 'test' }))
      .plaintext
    injectFetch = async (input, init) => {
      const req = new Request(input as RequestInfo, init)
      const u = new URL(req.url)
      const res = await server.fastify.inject({
        method: req.method as 'GET',
        url: u.pathname + u.search,
        headers: Object.fromEntries(req.headers as unknown as Iterable<[string, string]>),
        ...(init?.body ? { payload: String(init.body) } : {}),
      })
      return new Response(res.body, {
        status: res.statusCode,
        headers: { 'content-type': 'application/json' },
      })
    }
  }, 60_000)

  afterAll(async () => {
    await server?.cleanup()
  })

  const client = (mode: 'live' | 'test') =>
    createPublicClient({
      baseUrl: 'http://integration-server.test',
      apiKey: mode === 'test' ? test : live,
      mode,
      options: { fetch: injectFetch },
    })

  it('reaches a versioned path in live mode', async () => {
    const { error } = await client('live').GET('/customers' as never, {} as never)
    expect(error, 'the SDK built a URL the router does not serve').toBeUndefined()
  })

  it('reaches an absolute path, which must NOT gain the version prefix', async () => {
    const { error } = await client('live').GET('/health' as never, {} as never)
    expect(error).toBeUndefined()
  })

  it('reaches the sandbox in test mode, and gets sandbox data back', async () => {
    const connection_id = sandboxConnectionId('default', 'accounting')
    const { data, error } = await client('test').GET('/accounting/invoices' as never, {
      params: { query: { connection_id } },
    } as never)
    expect(error).toBeUndefined()
    expect((data as unknown as { data: unknown[] }).data.length).toBeGreaterThan(0)
  })

  it('reaches the sandbox control route, which is absolute in both modes', async () => {
    const { data, error } = await client('test').GET('/test/v1/connections' as never, {} as never)
    expect(error).toBeUndefined()
    // One per mounted vertical — the ids every other sandbox call needs.
    expect((data as unknown as { data: unknown[] }).data.length).toBe(9)
  })

  it('basePathFor matches what the server actually mounts', () => {
    expect(basePathFor('live')).toBe('/v1')
    expect(basePathFor('test')).toBe('/test/v1')
  })
})
