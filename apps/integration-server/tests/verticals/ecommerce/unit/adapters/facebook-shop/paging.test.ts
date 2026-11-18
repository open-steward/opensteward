/**
 * Facebook Shop lists catalog products (`GET /{catalog_id}/products`) with
 * Graph API cursor paging: `limit` sizes a page, `after` is the cursor that
 * points to the end of the page returned, and `paging.next` is "The Graph API
 * endpoint that will return the next page of data. If not included, this is
 * the last page of data." (https://developers.facebook.com/docs/graph-api/results).
 *
 * listProducts and listInventoryLevels (one level per product, from the same
 * edge) used to forward `after` only from `params.after`, which the router
 * never supplies, so page 2 repeated page 1.
 *
 * The fake below honours ONLY the documented parameters: `limit` and `after`.
 * It returns `paging.cursors` on every page, the last included, and `paging.next`
 * only while more rows remain — so an adapter that keys the end off the cursor
 * rather than `next` never ends. The edge documents no maximum `limit`; the
 * guide says only that "Some edges may also have a maximum on the limit value",
 * so the fake can silently cap a page to prove no row depends on the size sent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { FacebookShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/facebook-shop/index'

const CREDS = {
  accessToken: 'tok',
  extra: { catalogId: 'cat1', commerceAccountId: 'cma1' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

const encode = (i: number): string => Buffer.from(`pos:${i}`).toString('base64')
const decode = (c: string): number => Number(Buffer.from(c, 'base64').toString().slice(4))

function fakeGraph(products: number, opts: { cap?: number } = {}): Call[] {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    if (path !== '/cat1/products') throw new Error(`unexpected GET ${path}`)
    const asked = params['limit'] === undefined ? 25 : Number(params['limit'])
    const size = Math.min(asked, opts.cap ?? Infinity)
    const start = params['after'] === undefined ? 0 : decode(String(params['after']))
    const end = Math.min(start + size, products)
    const data = []
    for (let i = start; i < end; i++)
      data.push({ id: String(i + 1), name: `P${i + 1}`, inventory: i })
    const paging: Record<string, unknown> = {
      cursors: { before: encode(start), after: encode(end) },
    }
    if (end < products)
      paging['next'] = `https://graph.facebook.com/v19.0/cat1/products?after=${encode(end)}`
    return { data: { data, paging } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

type ListFn = (a: FacebookShopAdapter, p: QueryParams) => Promise<{ id: string }[]>

async function walk(
  list: ListFn,
  limit: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: (boolean | undefined)[]; sizes: number[] }> {
  const adapter = new FacebookShopAdapter()
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await list(adapter, params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

const listProducts: ListFn = (a, p) => a.listProducts(CREDS, p)
const listInventoryLevels: ListFn = (a, p) => a.listInventoryLevels(CREDS, p)

describe.each([
  ['listProducts', listProducts, (n: number): string => String(n)],
  ['listInventoryLevels', listInventoryLevels, (n: number): string => `${n}:facebook-default`],
] as const)('Facebook Shop %s pages by the Graph API after cursor', (_name, list, idOf) => {
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => idOf(i + 1))

  it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
    const calls = fakeGraph(7)
    const r = await walk(list, 3, 3)
    expect(r.ids).toEqual(ids(7))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params['limit'])).toEqual([3, 3, 3])
    expect(calls).toHaveLength(3)
  })

  it('ends exactly on a full last page: 2L rows read hasMore [true, false]', async () => {
    fakeGraph(6)
    const r = await walk(list, 3, 2)
    expect(r.ids).toEqual(ids(6))
    expect(r.hasMore).toEqual([true, false])
  })

  it('the page-2 request carries the after cursor from page 1', async () => {
    const calls = fakeGraph(7)
    await walk(list, 3, 2)
    expect(calls[0]!.params['after']).toBeUndefined()
    expect(calls[1]!.params).toMatchObject({ limit: 3, after: encode(3) })
  })

  it('a cold page 2 walks the cursor chain rather than repeating page 1', async () => {
    fakeGraph(7)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await list(new FacebookShopAdapter(), params)
    expect(rows.map((r) => r.id)).toEqual(ids(7).slice(3, 6))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('serves every row when the edge silently caps a large limit', async () => {
    const calls = fakeGraph(150, { cap: 100 })
    const r = await walk(list, 250, 3)
    expect(r.ids).toEqual(ids(150))
    expect(r.hasMore).toEqual([true, false, false])
    expect(calls.filter((c) => c.params['after'] !== undefined)).toHaveLength(1)
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeGraph(7)
    const adapter = new FacebookShopAdapter()
    const p2 = parseListQuery({ limit: '3', page: '2' })
    const env2 = listPage(await list(adapter, p2), p2, 'facebook-shop')
    expect(env2.data.map((r) => r.id)).toEqual(ids(7).slice(3, 6))
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '3', page: '3' })
    const env3 = listPage(await list(adapter, p3), p3, 'facebook-shop')
    expect(env3.data.map((r) => r.id)).toEqual(ids(7).slice(6))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('Facebook Shop pager keys', () => {
  it('products and inventory keep separate cursor walks', async () => {
    const calls = fakeGraph(7)
    const adapter = new FacebookShopAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 3 }))
    calls.length = 0
    // A cold inventory page 2 must walk its own chain from page 1.
    const rows = await adapter.listInventoryLevels(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual([
      '4:facebook-default',
      '5:facebook-default',
      '6:facebook-default',
    ])
    expect(calls).toHaveLength(2)
  })

  it('two connections to the same catalog keep separate cursor walks', async () => {
    const calls = fakeGraph(7)
    const adapter = new FacebookShopAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    // Graph pages depend on the viewer's visibility, so token B must not
    // resume token A's walk: a cold page 2 walks B's own chain from page 1.
    const credsB = { ...CREDS, accessToken: 'tok-b' }
    const rows = await adapter.listProducts(credsB, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params['after']).toBeUndefined()
  })

  it('a different limit keeps its own cursor walk', async () => {
    const calls = fakeGraph(12)
    const adapter = new FacebookShopAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 3 }))
    calls.length = 0
    // limit=5 page 2 is rows 6-10; reusing a limit=3 cursor would start at row 4 or 7.
    const rows = await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['6', '7', '8', '9', '10'])
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params['after']).toBeUndefined()
  })
})

describe('Facebook Shop explicit after', () => {
  it('an explicit after fetches that one page and reports hasMore from paging.next', async () => {
    const calls = fakeGraph(7)
    const params = withPageSink({ page: 1, limit: 3, after: encode(3) } as QueryParams)
    const rows = await new FacebookShopAdapter().listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toMatchObject({ limit: 3, after: encode(3) })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an explicit after on the last page reports hasMore false', async () => {
    const calls = fakeGraph(7)
    const params = withPageSink({ page: 1, limit: 3, after: encode(6) } as QueryParams)
    const rows = await new FacebookShopAdapter().listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['7'])
    expect(calls).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
