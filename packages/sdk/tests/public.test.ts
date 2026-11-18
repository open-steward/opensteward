/**
 * Public client unit tests.
 *
 * Uses a fake `fetch` (msw is not in this workspace and isn't worth
 * pulling in for one assertion) so the test stays hermetic and we can
 * inspect the outbound Request directly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPublicClient } from '../src/public'

interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

function captureFetch(
  response: unknown,
  status = 200,
): { fetch: typeof globalThis.fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = []
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const req = new Request(input as RequestInfo, init)
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => {
      headers[k] = v
    })
    captured.push({
      url: req.url,
      method: req.method,
      headers,
      body: init?.body ? String(init.body) : null,
    })
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { fetch: fakeFetch, captured }
}

describe('createPublicClient', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('attaches the Bearer header from `apiKey` and routes the path correctly', async () => {
    const payload = { data: [{ id: 'c-1', name: 'Acme' }] }
    const { fetch, captured } = captureFetch(payload)
    globalThis.fetch = fetch

    const client = createPublicClient({
      baseUrl: 'http://localhost:3010',
      apiKey: 'osk_test_123',
    })

    // Using `as never` here because the generated `paths` type is
    // exhaustive — the test asserts at runtime that the call shape
    // matches, not at compile time. (A round-trip "wire" test.)
    const { data, error } = await client.GET(
      '/customers' as never,
      {
        params: { query: { limit: 10 } },
      } as never,
    )

    expect(error).toBeUndefined()
    expect(data).toEqual(payload)
    expect(captured).toHaveLength(1)
    // Assert the WHOLE path, not a substring — a contains-check cannot
    // tell a correct URL from one missing its version segment
    // (`toContain('/customers')` is true of `http://host/customers`,
    // a 404 against the real server, since the route is `/v1/customers`).
    expect(new URL(captured[0].url).pathname).toBe('/v1/customers')
    expect(captured[0].url).toContain('limit=10')
    expect(captured[0].method).toBe('GET')
    expect(captured[0].headers.authorization).toBe('Bearer osk_test_123')
  })

  it('routes versioned paths at /test/v1 in sandbox mode', async () => {
    const { fetch, captured } = captureFetch({ data: [] })
    globalThis.fetch = fetch

    const client = createPublicClient({
      baseUrl: 'http://localhost:3010',
      apiKey: 'osk_test_abc',
      mode: 'test',
    })
    await client.GET('/accounting/invoices' as never, {} as never)
    expect(new URL(captured[0].url).pathname).toBe('/test/v1/accounting/invoices')
  })

  it('leaves absolute paths alone in both modes', async () => {
    // `/health`, `/admin/*`, `/auth/*` and the sandbox control routes keep
    // their own path in the spec. Prefixing them would 404 exactly as
    // failing to prefix a versioned one does.
    for (const mode of ['live', 'test'] as const) {
      const { fetch, captured } = captureFetch({ status: 'ok' })
      globalThis.fetch = fetch
      const client = createPublicClient({
        baseUrl: 'http://localhost:3010',
        apiKey: 'osk_x',
        mode,
      })
      await client.GET('/health' as never, {} as never)
      expect(new URL(captured[0].url).pathname, mode).toBe('/health')
    }
  })

  it('versions /connections in both modes', async () => {
    // The operator surface lives at `/admin/connections`, so the tenant
    // `/connections` strips cleanly and behaves like every other versioned
    // route: `/v1/connections` live, `/test/v1/connections` in test mode.
    const live = captureFetch({ data: [] })
    globalThis.fetch = live.fetch
    const liveClient = createPublicClient({ baseUrl: 'http://localhost:3010', apiKey: 'osk_x' })
    await liveClient.GET('/connections' as never, {} as never)
    expect(new URL(live.captured[0].url).pathname).toBe('/v1/connections')

    const test = captureFetch({ data: [] })
    globalThis.fetch = test.fetch
    const testClient = createPublicClient({
      baseUrl: 'http://localhost:3010',
      apiKey: 'osk_test_x',
      mode: 'test',
    })
    await testClient.GET('/connections' as never, {} as never)
    expect(new URL(test.captured[0].url).pathname).toBe('/test/v1/connections')
  })

  it('keeps the operator /admin/connections surface absolute', async () => {
    // Operator, X-Admin-Secret, live-only — no sandbox variant.
    for (const mode of ['live', 'test'] as const) {
      const { fetch, captured } = captureFetch({ data: [] })
      globalThis.fetch = fetch
      const client = createPublicClient({ baseUrl: 'http://localhost:3010', apiKey: 'osk_x', mode })
      await client.GET('/admin/connections' as never, {} as never)
      expect(new URL(captured[0].url).pathname, mode).toBe('/admin/connections')
    }
  })

  it('tolerates a trailing slash on baseUrl', async () => {
    const { fetch, captured } = captureFetch({ data: [] })
    globalThis.fetch = fetch
    const client = createPublicClient({ baseUrl: 'http://localhost:3010/', apiKey: 'osk_x' })
    await client.GET('/customers' as never, {} as never)
    expect(new URL(captured[0].url).pathname).toBe('/v1/customers')
  })

  it('lets callers add extra default headers without dropping auth', async () => {
    const { fetch, captured } = captureFetch({ ok: true })
    globalThis.fetch = fetch

    const client = createPublicClient({
      baseUrl: 'http://localhost:3010',
      apiKey: 'osk_x',
      options: { headers: { 'X-Trace-Id': 'abc' } },
    })

    await client.GET('/customers' as never, {} as never)
    expect(captured[0].headers.authorization).toBe('Bearer osk_x')
    expect(captured[0].headers['x-trace-id']).toBe('abc')
  })
})
