/**
 * Request-shape + pagination tests for the NuORDER client: OAuth 1.0a
 * signing on every call, host-per-environment, `__limit`/`__last_id`
 * cursor pagination, and the documented (v3.1-prefixed) catalog paths.
 * Verified against https://assets.nuorder.com/api-docs/index.html.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import { NuorderAdapter } from '../../../../../../src/verticals/ecommerce/adapters/nuorder/index'

const CREDS = {
  accessToken: 'tok1',
  extra: {
    consumerKey: 'ck1',
    consumerSecret: 'cs1',
    token: 'tok1',
    tokenSecret: 'ts1',
    environment: 'sandbox1',
  },
}

interface Call {
  path: string
  config: { params?: Record<string, unknown>; headers?: Record<string, string> }
}

function fakeAxios(handlers: {
  get?: (path: string, config: Call['config']) => unknown
  post?: (path: string, body: unknown, config: Call['config']) => unknown
  put?: (path: string, body: unknown, config: Call['config']) => unknown
  patch?: (path: string, body: unknown, config: Call['config']) => unknown
  delete?: (path: string, config: Call['config']) => unknown
}) {
  const calls: { method: string; path: string; body?: unknown; config: Call['config'] }[] = []
  let baseURL = ''
  const get = vi.fn(async (path: string, config: Call['config'] = {}) => {
    calls.push({ method: 'GET', path, config })
    return { data: handlers.get?.(path, config) ?? [] }
  })
  const post = vi.fn(async (path: string, body: unknown, config: Call['config'] = {}) => {
    calls.push({ method: 'POST', path, body, config })
    return { data: handlers.post?.(path, body, config) ?? {} }
  })
  const put = vi.fn(async (path: string, body: unknown, config: Call['config'] = {}) => {
    calls.push({ method: 'PUT', path, body, config })
    return { data: handlers.put?.(path, body, config) ?? {} }
  })
  const patch = vi.fn(async (path: string, body: unknown, config: Call['config'] = {}) => {
    calls.push({ method: 'PATCH', path, body, config })
    return { data: handlers.patch?.(path, body, config) ?? {} }
  })
  const del = vi.fn(async (path: string, config: Call['config'] = {}) => {
    calls.push({ method: 'DELETE', path, config })
    return { data: handlers.delete?.(path, config) ?? {} }
  })
  vi.spyOn(axios, 'create').mockImplementation((cfg?: { baseURL?: string }) => {
    baseURL = cfg?.baseURL ?? ''
    return { get, post, put, patch, delete: del } as never
  })
  return { calls, getBaseUrl: () => baseURL }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('NuorderAdapter — host + OAuth1 signing', () => {
  it('resolves the sandbox1 host from credentials.extra.environment', async () => {
    const { getBaseUrl } = fakeAxios({ get: () => [] })
    const adapter = new NuorderAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(getBaseUrl()).toBe('https://sandbox1.nuorder.com')
  })

  it('signs every GET with an OAuth 1.0a Authorization header', async () => {
    const { calls } = fakeAxios({ get: () => [] })
    const adapter = new NuorderAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.config.headers?.['Authorization']).toMatch(/^OAuth /)
    expect(calls[0]!.config.headers?.['Authorization']).toContain('oauth_signature_method="HMAC-SHA1"')
    expect(calls[0]!.config.headers?.['Authorization']).toContain('oauth_consumer_key="ck1"')
  })

  it('throws a readable error when OAuth credentials are missing', async () => {
    const adapter = new NuorderAdapter()
    await expect(adapter.listProducts({ accessToken: 't' }, { limit: 10 })).rejects.toThrow(/OAuth 1\.0a/)
  })
})

describe('NuorderAdapter — __limit/__last_id pagination', () => {
  const product = (i: number) => ({ id: 100 + i, name: `P${i}` })

  function paged(total: number) {
    return (path: string, config: Call['config']) => {
      const lastId = config.params?.['__last_id'] != null ? Number(config.params['__last_id']) : 99
      const limit = Number(config.params?.['__limit'])
      const start = lastId - 99
      const rows = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) =>
        product(start + i),
      )
      return rows
    }
  }

  it('page 2 continues from the last id of page 1 (GET /api/products)', async () => {
    const { calls } = fakeAxios({ get: paged(5) })
    const adapter = new NuorderAdapter()
    const list = (p: ReturnType<typeof withPageSink>) => adapter.listProducts(CREDS, p)

    const p1 = withPageSink({ page: 1, limit: 2 })
    const items1 = await list(p1)
    expect(items1.map((p) => p.id)).toEqual(['100', '101'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 2 })
    const items2 = await list(p2)
    expect(items2.map((p) => p.id)).toEqual(['102', '103'])

    const productCalls = calls.filter((c) => c.path === '/api/products')
    expect(productCalls.map((c) => c.config.params?.['__last_id'])).toEqual([undefined, '101'])
    expect(productCalls.every((c) => c.config.params?.['__limit'] === '2')).toBe(true)
  })

  it('two brands never share cursors', async () => {
    const { calls } = fakeAxios({ get: paged(5) })
    const adapter = new NuorderAdapter()
    await adapter.listProducts(
      { accessToken: 't', extra: { ...CREDS.extra, consumerKey: 'brand-a' } },
      { page: 1, limit: 2 },
    )
    await adapter.listProducts(
      { accessToken: 't', extra: { ...CREDS.extra, consumerKey: 'brand-b' } },
      { page: 2, limit: 2 },
    )
    expect(calls.map((c) => c.config.params?.['__last_id'])).toEqual([undefined, undefined, '101'])
  })

  it('collections use the v3.1-prefixed catalogs path', async () => {
    const { calls } = fakeAxios({ get: () => [] })
    const adapter = new NuorderAdapter()
    await adapter.listCollections(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(calls[0]!.path).toBe('/api/v3.1/catalogs')
  })
})

describe('NuorderAdapter — writes use only confirmed fields', () => {
  it('deleteProduct sends a status-change body ({ active: false }) to the confirmed update path', async () => {
    const { calls } = fakeAxios({ post: () => ({}) })
    const adapter = new NuorderAdapter()
    await adapter.deleteProduct(CREDS, '4001')
    expect(calls).toEqual([
      expect.objectContaining({ method: 'POST', path: '/api/product/4001', body: { active: false } }),
    ])
  })

  it('createCollection POSTs only title/description to /api/v3.1/catalogs', async () => {
    const { calls } = fakeAxios({ post: () => ({ id: 1, title: 'T' }) })
    const adapter = new NuorderAdapter()
    await adapter.createCollection(CREDS, { title: 'T', description: 'D' })
    expect(calls[0]).toEqual(
      expect.objectContaining({ method: 'POST', path: '/api/v3.1/catalogs', body: { title: 'T', description: 'D' } }),
    )
  })

  it('deleteCollection DELETEs the singular /api/v3.1/catalog/{id} path', async () => {
    const { calls } = fakeAxios({ delete: () => ({}) })
    const adapter = new NuorderAdapter()
    await adapter.deleteCollection(CREDS, '501')
    expect(calls[0]!.path).toBe('/api/v3.1/catalog/501')
  })
})
