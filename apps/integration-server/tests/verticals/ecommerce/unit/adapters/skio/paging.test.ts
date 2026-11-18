/**
 * Skio list paging contract.
 *
 * Skio's Public REST API reference (https://code.skio.com/rest-api/, an
 * OpenAPI 3.0 spec inlined in a Redoc page) describes GET /products,
 * GET /orders and GET /storefront-users alike:
 *
 *   "You should paginate through the results using the `pageInfo` object
 *   included in the response. If `hasNextPage` is true, you may fetch the
 *   following page by providing the `after` parameter with the `endCursor`
 *   value from the previous response. The page size is controlled by the
 *   `first` parameter, which is required and must be an integer between 1
 *   and 1000."
 *
 * One upstream page is one caller page (pageByCursor). The fake upstream
 * serves only the four documented paths, rejects any query parameter the spec
 * does not list for that path, honours `first`, `after`, `id` and
 * `updatedAfter`, rejects a `first` outside 1..1000 as the real one would,
 * and — like a real cursor API — returns an `endCursor` on the last page too,
 * so only `hasNextPage` says whether there is more.
 *
 * listVariants and getVariant refuse with 501 before any request: the spec has
 * no variant path, and the variants nested in /products carry a `price`
 * number with no currency.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { SkioAdapter } from '../../../../../../src/verticals/ecommerce/adapters/skio/index'

const CREDS: Credentials = { accessToken: 'skio-key' }
const MAX = 1000

type Raw = Record<string, unknown>

interface Call {
  path: string
  params: Record<string, unknown>
}

/** A cursor as account `tag` mints it; another account rejects it. */
function cursorFor(path: string, offset: number, tag = ''): string {
  return Buffer.from(`${tag}${path}:${offset}`).toString('base64')
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

/** Query parameters the spec lists for each path (GET only). */
const DOCUMENTED: Record<string, string[]> = {
  products: [
    'first',
    'after',
    'id',
    'platformId',
    'ids',
    'platformIds',
    'status',
    'tags',
    'updatedAfter',
    'updatedBefore',
  ],
  orders: [
    'first',
    'after',
    'id',
    'platformId',
    'createdAfter',
    'createdBefore',
    'updatedAfter',
    'updatedBefore',
    'storefrontUserId',
  ],
  'storefront-users': [
    'first',
    'after',
    'id',
    'platformId',
    'createdAfter',
    'createdBefore',
    'updatedAfter',
    'updatedBefore',
    'email',
  ],
  subscriptions: [],
}

function makeServer(data: Partial<Record<string, Raw[]>>, tag = '') {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    const documented = DOCUMENTED[path]
    if (!documented) throw Object.assign(new Error('404 Not Found'), { response: { status: 404 } })
    for (const k of Object.keys(params))
      if (!documented.includes(k)) throw badRequest(`undocumented parameter ${k} on ${path}`)
    const all = data[path]
    if (!all) throw new Error(`unexpected path in test: ${path}`)
    // The documented incremental filter, "updated on or after this timestamp".
    // A cursor is minted for one filtered result set and rejected by another.
    const since = params['updatedAfter'] as string | undefined
    const id = params['id'] as string | undefined
    const rows = all.filter(
      (r) => (!since || String(r['updatedAt']) >= since) && (!id || r['id'] === id),
    )
    const scope = `${tag}${path}${since ? `@${since}` : ''}`
    const first = Number(params['first'])
    if (!Number.isInteger(first) || first < 1 || first > MAX)
      throw badRequest(`first ${String(params['first'])}`)
    let start = 0
    const after = params['after']
    if (after !== undefined && after !== null) {
      const m = /^(.+):(\d+)$/.exec(Buffer.from(String(after), 'base64').toString())
      if (!m || m[1] !== scope) throw badRequest('bad cursor')
      start = Number(m[2])
    }
    const page = rows.slice(start, start + first)
    const end = start + page.length
    return {
      data: {
        data: page,
        pageInfo: {
          hasNextPage: end < rows.length,
          startCursor: page.length ? cursorFor(scope, start) : null,
          endCursor: page.length ? cursorFor(scope, end) : null,
        },
      },
    }
  })
  return { get, calls }
}

function fake(data: Partial<Record<string, Raw[]>>) {
  const server = makeServer(data)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get, defaults: {} } as never)
  return server
}

const pad = (i: number): string => String(i + 1).padStart(4, '0')

interface Case {
  method: 'listProducts' | 'listOrders' | 'listCustomers'
  path: string
  build: (n: number) => { data: Partial<Record<string, Raw[]>>; ids: string[] }
}

const simple = (path: string, prefix: string) => (n: number) => ({
  data: { [path]: Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${pad(i)}` })) },
  ids: Array.from({ length: n }, (_, i) => `${prefix}-${pad(i)}`),
})

/** Storefront users carry the spec's required fields. */
const users = (n: number) => ({
  data: {
    'storefront-users': Array.from({ length: n }, (_, i) => ({
      id: `user-${pad(i)}`,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-06-01T08:00:00Z',
      activeSubscriptions: [],
      cancelledSubscriptions: [],
      pausedSubscriptions: [],
      failedSubscriptions: [],
    })),
  },
  ids: Array.from({ length: n }, (_, i) => `user-${pad(i)}`),
})

const CASES: Case[] = [
  { method: 'listProducts', path: 'products', build: simple('products', 'prod') },
  { method: 'listOrders', path: 'orders', build: simple('orders', 'ord') },
  { method: 'listCustomers', path: 'storefront-users', build: users },
]

async function list(
  adapter: SkioAdapter,
  method: Case['method'],
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<string[]> {
  const rows = (await adapter[method](creds, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Skio list paging', () => {
  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 17]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const { data, ids } = c.build(2 * L + 1)
          fake(data)
          const a = new SkioAdapter()
          const seen: string[] = []
          const hasMore: (boolean | undefined)[] = []
          for (const page of [1, 2, 3]) {
            const params = withPageSink({ page, limit: L } as QueryParams)
            seen.push(...(await list(a, c.method, params)))
            hasMore.push(readUpstreamPage(params)?.hasMore)
          }
          expect(seen).toEqual(ids)
          expect(hasMore).toEqual([true, true, false])
        }
      })

      it('the page-2 request carries the documented `after` cursor and `first`', async () => {
        const L = 7
        const { data, ids } = c.build(2 * L + 1)
        const { calls } = fake(data)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new SkioAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls[0]!.params['after']).toBeUndefined()
        expect(calls.every((x) => x.path === c.path && x.params['first'] === L)).toBe(true)
        expect(calls.at(-1)!.params['after']).toBe(cursorFor(c.path, L))
        expect(calls.every((x) => !('limit' in x.params) && !('page' in x.params))).toBe(true)
      })

      it('clamps a limit above 1000 and still serves every row', async () => {
        const { data, ids } = c.build(2 * MAX + 1)
        const { calls } = fake(data)
        const a = new SkioAdapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(10)
          const params = withPageSink({ page, limit: 5000 } as QueryParams)
          seen.push(...(await list(a, c.method, params)))
          const meta = readUpstreamPage(params)
          expect(meta?.pageSize).toBe(MAX)
          if (!meta?.hasMore) break
        }
        expect(seen).toEqual(ids)
        for (const x of calls) expect(x.params['first']).toBeLessThanOrEqual(MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const { data, ids } = c.build(25)
        fake(data)
        const a = new SkioAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'skio')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'skio')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('an exactly full last page reports no more', async () => {
        const { data, ids } = c.build(10)
        fake(data)
        const params = withPageSink({ page: 2, limit: 5 } as QueryParams)
        expect(await list(new SkioAdapter(), c.method, params)).toEqual(ids.slice(5))
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })

      it('an explicit upstream cursor is forwarded as one page', async () => {
        const { data, ids } = c.build(30)
        const { calls } = fake(data)
        const params = withPageSink({ limit: 10, cursor: cursorFor(c.path, 10) } as QueryParams)
        expect(await list(new SkioAdapter(), c.method, params)).toEqual(ids.slice(10, 20))
        expect(calls).toHaveLength(1)
        expect(calls[0]!.params['after']).toBe(cursorFor(c.path, 10))
        expect(readUpstreamPage(params)?.hasMore).toBe(true)
      })
    })
  }

  it('a walk at one limit never serves another limit its positions', async () => {
    const { data, ids } = CASES[0]!.build(30)
    fake(data)
    const a = new SkioAdapter()
    await list(a, 'listProducts', withPageSink({ page: 1, limit: 5 } as QueryParams))
    expect(
      await list(a, 'listProducts', withPageSink({ page: 2, limit: 7 } as QueryParams)),
    ).toEqual(ids.slice(7, 14))
  })

  it('two connections never share a walk', async () => {
    const a = makeServer(CASES[1]!.build(15).data)
    const b = makeServer(
      { orders: CASES[1]!.build(15).data.orders!.map((r) => ({ id: `B${String(r['id'])}` })) },
      'b/',
    )
    vi.spyOn(axios, 'create').mockImplementation(((config?: {
      headers?: Record<string, string>
    }) => {
      const auth = config?.headers?.['Authorization'] ?? ''
      const server = { 'API key-a': a, 'API key-b': b }[auth]
      if (!server) throw new Error(`no fake account for ${auth}`)
      return { get: server.get, defaults: {} }
    }) as never)
    const adapter = new SkioAdapter()
    await list(adapter, 'listOrders', withPageSink({ page: 1, limit: 5 } as QueryParams), {
      accessToken: 'key-a',
    })
    expect(
      await list(adapter, 'listOrders', withPageSink({ page: 2, limit: 5 } as QueryParams), {
        accessToken: 'key-b',
      }),
    ).toEqual(['Bord-0006', 'Bord-0007', 'Bord-0008', 'Bord-0009', 'Bord-0010'])
  })

  it('an explicit cursor on the last page reports no more', async () => {
    const { data, ids } = CASES[0]!.build(15)
    fake(data)
    const params = withPageSink({ limit: 10, cursor: cursorFor('products', 10) } as QueryParams)
    expect(await list(new SkioAdapter(), 'listProducts', params)).toEqual(ids.slice(10))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('with no limit, asks for the default page size of 100', async () => {
    const { data, ids } = CASES[0]!.build(150)
    const { calls } = fake(data)
    const params = withPageSink({ page: 1 } as QueryParams)
    expect(await list(new SkioAdapter(), 'listProducts', params)).toEqual(ids.slice(0, 100))
    expect(calls.map((x) => x.params['first'])).toEqual([100])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  describe('the updatedAfter filter', () => {
    const SINCE = new Date('2026-01-01T00:00:00.000Z')
    // 30 products; the even ones were updated on or after SINCE.
    const rows = Array.from({ length: 30 }, (_, i) => ({
      id: `prod-${pad(i)}`,
      updatedAt: i % 2 === 0 ? '2026-06-01T00:00:00.000Z' : '2025-06-01T00:00:00.000Z',
    }))
    const all = rows.map((r) => r.id)
    const recent = rows.filter((_, i) => i % 2 === 0).map((r) => r.id)

    it('reaches every upstream request of a filtered walk', async () => {
      const { calls } = fake({ products: rows })
      const a = new SkioAdapter()
      const seen: string[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: 5, updatedAfter: SINCE } as QueryParams)
        seen.push(...(await list(a, 'listProducts', params)))
      }
      expect(seen).toEqual(recent)
      expect(calls.length).toBeGreaterThan(0)
      for (const x of calls) expect(x.params['updatedAfter']).toBe(SINCE.toISOString())
    })

    it('a filtered walk and an unfiltered one never share positions', async () => {
      const { calls } = fake({ products: rows })
      const a = new SkioAdapter()
      await list(
        a,
        'listProducts',
        withPageSink({ page: 1, limit: 5, updatedAfter: SINCE } as QueryParams),
      )
      expect(
        await list(a, 'listProducts', withPageSink({ page: 2, limit: 5 } as QueryParams)),
      ).toEqual(all.slice(5, 10))
      await list(a, 'listProducts', withPageSink({ page: 1, limit: 5 } as QueryParams))
      expect(
        await list(
          a,
          'listProducts',
          withPageSink({ page: 2, limit: 5, updatedAfter: SINCE } as QueryParams),
        ),
      ).toEqual(recent.slice(5, 10))
      for (const x of calls)
        if (x.params['after'] !== undefined) {
          const pos = Buffer.from(String(x.params['after']), 'base64').toString()
          expect(pos.includes('@')).toBe(x.params['updatedAfter'] !== undefined)
        }
    })
  })

  it('two connections with the key in credentials.extra never share a walk', async () => {
    const a = makeServer(CASES[1]!.build(15).data)
    const b = makeServer(
      { orders: CASES[1]!.build(15).data.orders!.map((r) => ({ id: `B${String(r['id'])}` })) },
      'b/',
    )
    vi.spyOn(axios, 'create').mockImplementation(((config?: {
      headers?: Record<string, string>
    }) => {
      const auth = config?.headers?.['Authorization'] ?? ''
      const server = { 'API key-a': a, 'API key-b': b }[auth]
      if (!server) throw new Error(`no fake account for ${auth}`)
      return { get: server.get, defaults: {} }
    }) as never)
    const adapter = new SkioAdapter()
    const creds = (apiKey: string): Credentials => ({ accessToken: 'api-key', extra: { apiKey } })
    await list(
      adapter,
      'listOrders',
      withPageSink({ page: 1, limit: 5 } as QueryParams),
      creds('key-a'),
    )
    expect(
      await list(
        adapter,
        'listOrders',
        withPageSink({ page: 2, limit: 5 } as QueryParams),
        creds('key-b'),
      ),
    ).toEqual(['Bord-0006', 'Bord-0007', 'Bord-0008', 'Bord-0009', 'Bord-0010'])
  })
})

describe('Skio customers (GET /storefront-users)', () => {
  it('an updatedAfter walk sends the documented filter on every request', async () => {
    const SINCE = new Date('2026-01-01T00:00:00.000Z')
    const rows = users(9).data['storefront-users'].map((r, i) => ({
      ...r,
      updatedAt: i % 2 === 0 ? '2026-06-01T00:00:00.000Z' : '2025-06-01T00:00:00.000Z',
    }))
    const recent = rows.filter((_, i) => i % 2 === 0).map((r) => r.id)
    const { calls } = fake({ 'storefront-users': rows })
    const a = new SkioAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 2, updatedAfter: SINCE } as QueryParams)
      seen.push(...(await list(a, 'listCustomers', params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(recent)
    expect(hasMore).toEqual([true, true, false])
    for (const x of calls) {
      expect(x.path).toBe('storefront-users')
      expect(x.params['updatedAfter']).toBe(SINCE.toISOString())
    }
  })

  it('getCustomer reads one user back by the documented id filter', async () => {
    const { data, ids } = users(5)
    const { calls } = fake(data)
    const c = await new SkioAdapter().getCustomer(CREDS, ids[3]!)
    expect(c.id).toBe(ids[3])
    expect(calls).toEqual([{ path: 'storefront-users', params: { id: ids[3], first: 1 } }])
  })
})

describe('Skio variants are refused', () => {
  it('listVariants throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, calls } = makeServer({ products: [] })
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    await expect(
      new SkioAdapter().listVariants(CREDS, withPageSink({ page: 1, limit: 10 } as QueryParams)),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('getVariant throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, calls } = makeServer({ products: [] })
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    await expect(new SkioAdapter().getVariant(CREDS, 'var-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
    expect(create).not.toHaveBeenCalled()
  })
})
