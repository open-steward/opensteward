/**
 * Pinterest Shop lists collections from `GET /v5/catalogs/product_groups`
 * (operationId `catalogs_product_groups/list`), which pages by Pinterest's
 * bookmark cursor. Pinterest's own OpenAPI spec
 * (https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.yaml)
 * documents `bookmark` as "Cursor used to fetch the next page of items" and
 * `page_size` as "Maximum number of items to include in a single page."
 * (default 25, maximum 250); the response's `bookmark` is nullable, and "On
 * the final page, the `bookmark` value in the response is `null`."
 * (https://developers.pinterest.com/docs/reference/pagination/).
 *
 * listCollections used to read `params.cursor` and `params.pageSize`, which
 * the router never sets, so every page was page 1 at 25 rows.
 *
 * The fake honours ONLY the documented parameters: `bookmark` and `page_size`
 * (default 25, rejected above 250), and answers a null bookmark on the last
 * page.
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
import { PinterestShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/pinterest-shop/index'

const CREDS = { accessToken: 'tok', refreshToken: 'ref' }

interface Call {
  path: string
  params: Record<string, unknown>
}

const encode = (i: number): string => Buffer.from(`bm:${i}`).toString('base64')
const decode = (c: string): number => Number(Buffer.from(c, 'base64').toString().slice(3))

function fakePinterest(groups: number): Call[] {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    if (path !== '/catalogs/product_groups') throw new Error(`unexpected GET ${path}`)
    const size = params['page_size'] === undefined ? 25 : Number(params['page_size'])
    if (!Number.isInteger(size) || size < 1 || size > 250) {
      throw new Error(`page_size ${String(params['page_size'])} outside 1..250`)
    }
    const start = params['bookmark'] === undefined ? 0 : decode(String(params['bookmark']))
    const end = Math.min(start + size, groups)
    const items = []
    for (let i = start; i < end; i++) items.push({ id: `pg${i + 1}`, name: `Group ${i + 1}` })
    return { data: { items, bookmark: end < groups ? encode(end) : null } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `pg${i + 1}`)

async function walk(
  limit: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: (boolean | undefined)[]; sizes: number[] }> {
  const adapter = new PinterestShopAdapter()
  const out: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await adapter.listCollections(CREDS, params)
    out.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids: out, hasMore, sizes }
}

describe('Pinterest Shop listCollections pages by bookmark', () => {
  it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
    const calls = fakePinterest(7)
    const r = await walk(3, 3)
    expect(r.ids).toEqual(ids(7))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params['page_size'])).toEqual([3, 3, 3])
    expect(calls).toHaveLength(3)
  })

  it('ends exactly on a full last page: 2L rows read hasMore [true, false]', async () => {
    fakePinterest(6)
    const r = await walk(3, 2)
    expect(r.ids).toEqual(ids(6))
    expect(r.hasMore).toEqual([true, false])
  })

  it('the page-2 request carries the bookmark from page 1', async () => {
    const calls = fakePinterest(7)
    await walk(3, 2)
    expect(calls[0]!.params['bookmark']).toBeUndefined()
    expect(calls[1]!.params).toMatchObject({ page_size: 3, bookmark: encode(3) })
  })

  it('a cold page 2 walks the bookmark chain rather than repeating page 1', async () => {
    fakePinterest(7)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await new PinterestShopAdapter().listCollections(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(7).slice(3, 6))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('clamps a limit above 250 to page_size 250, reports it, and serves every row', async () => {
    const calls = fakePinterest(501)
    const r = await walk(500, 3)
    expect(r.ids).toEqual(ids(501))
    expect(r.sizes).toEqual([250, 250, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params['page_size'])).toEqual([250, 250, 250])
    const params = withPageSink({ page: 1, limit: 500 })
    await new PinterestShopAdapter().listCollections(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBe(250)
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakePinterest(7)
    const adapter = new PinterestShopAdapter()
    const p2 = parseListQuery({ limit: '3', page: '2' })
    const env2 = listPage(await adapter.listCollections(CREDS, p2), p2, 'pinterest-shop')
    expect(env2.data.map((r) => r.id)).toEqual(ids(7).slice(3, 6))
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '3', page: '3' })
    const env3 = listPage(await adapter.listCollections(CREDS, p3), p3, 'pinterest-shop')
    expect(env3.data.map((r) => r.id)).toEqual(ids(7).slice(6))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('two connections keep separate bookmark walks', async () => {
    const calls = fakePinterest(7)
    const adapter = new PinterestShopAdapter()
    await adapter.listCollections(CREDS, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const credsB = { accessToken: 'tok-b', refreshToken: 'ref-b' }
    const rows = await adapter.listCollections(credsB, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['pg4', 'pg5', 'pg6'])
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params['bookmark']).toBeUndefined()
  })

  it('a different limit keeps its own bookmark walk', async () => {
    const calls = fakePinterest(12)
    const adapter = new PinterestShopAdapter()
    await adapter.listCollections(CREDS, withPageSink({ page: 1, limit: 3 }))
    await adapter.listCollections(CREDS, withPageSink({ page: 2, limit: 3 }))
    calls.length = 0
    const rows = await adapter.listCollections(CREDS, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['pg6', 'pg7', 'pg8', 'pg9', 'pg10'])
    expect(calls).toHaveLength(2)
  })

  it('an unset limit sends the documented default page_size 25', async () => {
    const calls = fakePinterest(30)
    const params = withPageSink({ page: 1 })
    const rows = await new PinterestShopAdapter().listCollections(CREDS, params)
    expect(calls.map((c) => c.params['page_size'])).toEqual([25])
    expect(rows.map((r) => r.id)).toEqual(ids(25))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
