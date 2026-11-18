/**
 * Zid listCollections paging contract.
 *
 * Zid's List Categories reference (https://docs.zid.sa/get-all-categories)
 * documents GET /v1/managers/store/categories with no query parameters:
 *
 *   "Fetches all the available categories for a certain store, including
 *   details such as their names, status, SEO information, and the number of
 *   products they contain."
 *
 * Zid's own Python SDK lists categories the same way, with no params. So the
 * adapter fetches the whole list once and slices it locally (pageLocally).
 *
 * The same page's response EXAMPLE carries a `pagination` block (page 1,
 * page_size 100, next_page 2, last_page 11) that no parameter documents. When
 * a response says there are more pages, the rows in hand are not the whole
 * collection: the adapter must not report them as a complete total.
 *
 * The fake upstream honours no parameter at all, as documented, and fails
 * the test if the adapter sends one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ZidAdapter } from '../../../../../../src/verticals/ecommerce/adapters/zid/index'

const CREDS: Credentials = { accessToken: 'zid-token' }
const PATH = '/managers/store/categories'

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

interface Pagination {
  page?: number
  page_size?: number
  next_page?: number | null
  last_page?: number
  result_count?: number
}

function fake(n: number, pagination?: Pagination) {
  const calls: Call[] = []
  const categories = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: { en: `Category ${i + 1}`, ar: '' },
  }))
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: config?.params })
    if (path !== PATH) throw new Error(`unexpected path in test: ${path}`)
    if (config?.params && Object.keys(config.params).length > 0)
      throw new Error(`undocumented params sent: ${JSON.stringify(config.params)}`)
    return {
      data: {
        status: 'object',
        categories,
        ...(pagination ? { pagination } : {}),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, ids: categories.map((c) => String(c.id)) }
}

async function ids(a: ZidAdapter, params: QueryParams): Promise<string[]> {
  return (await a.listCollections(CREDS, params)).map((c) => c.id)
}

const adapter = () =>
  new ZidAdapter({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x/cb' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Zid listCollections paging', () => {
  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [3, 17]) {
      vi.restoreAllMocks()
      const { ids: all } = fake(2 * L + 1)
      const a = adapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await ids(a, params)))
        const up = readUpstreamPage(params)
        hasMore.push(up?.hasMore)
        expect(up?.totalCount).toBe(2 * L + 1)
        expect(up?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
    }
  })

  it('page 2 sends the documented request (no paging params) and serves different rows', async () => {
    const { calls } = fake(7)
    const a = adapter()
    const p1 = await ids(a, withPageSink({ page: 1, limit: 3 } as QueryParams))
    const p2 = await ids(a, withPageSink({ page: 2, limit: 3 } as QueryParams))
    expect(calls.map((c) => c.path)).toEqual([PATH, PATH])
    expect(p1).toEqual(['1', '2', '3'])
    expect(p2).toEqual(['4', '5', '6'])
  })

  it('a limit above any page maximum still serves every row', async () => {
    const { ids: all } = fake(250)
    const params = withPageSink({ page: 1, limit: 1000 } as QueryParams)
    expect(await ids(adapter(), params)).toEqual(all)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(250)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    fake(5)
    const a = adapter()
    const p1 = parseListQuery({ page: '1', limit: '2' })
    const env1 = listPage(await a.listCollections(CREDS, p1), p1, 'zid')
    expect(env1.data.map((c) => c.id)).toEqual(['1', '2'])
    expect(env1.meta.hasMore).toBe(true)
    expect(env1.meta.totalCount).toBe(5)

    const p3 = parseListQuery({ page: '3', limit: '2' })
    const env3 = listPage(await a.listCollections(CREDS, p3), p3, 'zid')
    expect(env3.data.map((c) => c.id)).toEqual(['5'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a response whose pagination says more pages exist is not reported complete', async () => {
    const pagination = {
      page: 1,
      page_size: 100,
      next_page: 2,
      last_page: 11,
      result_count: 1096,
    }
    fake(100, pagination)
    const a = adapter()

    // The last window inside the rows in hand: short, but not the end.
    const last = withPageSink({ page: 4, limit: 30 } as QueryParams)
    expect(await ids(a, last)).toHaveLength(10)
    expect(readUpstreamPage(last)?.hasMore).toBe(true)
    expect(readUpstreamPage(last)?.totalCount).toBeUndefined()

    const p4 = parseListQuery({ page: '4', limit: '30' })
    const env = listPage(await a.listCollections(CREDS, p4), p4, 'zid')
    expect(env.meta.totalCount).toBeNull()
    expect(env.meta.hasMore).toBe(true)

    // A window past the rows Zid returned cannot be served; it must not
    // come back as an empty, final page.
    await expect(
      a.listCollections(CREDS, withPageSink({ page: 5, limit: 30 } as QueryParams)),
    ).rejects.toThrow(/more categories/i)
  })

  it('a window starting exactly at the end of the rows in hand throws a 502 UPSTREAM_INCOMPLETE', async () => {
    fake(100, { page: 1, page_size: 100, next_page: 2, last_page: 11, result_count: 1096 })
    const a = adapter()
    // 100 rows, limit 50: page 2 is the last window inside them; page 3 starts at offset 100.
    const p2 = withPageSink({ page: 2, limit: 50 } as QueryParams)
    expect(await ids(a, p2)).toHaveLength(50)
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)
    await expect(
      a.listCollections(CREDS, withPageSink({ page: 3, limit: 50 } as QueryParams)),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_INCOMPLETE' })
  })

  it('a call with no limit on an incomplete response throws rather than returning every row', async () => {
    fake(100, { page: 1, page_size: 100, next_page: 2, last_page: 11, result_count: 1096 })
    await expect(adapter().listCollections(CREDS, {} as QueryParams)).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_INCOMPLETE',
    })
  })

  it.each([
    ['next_page null', { page: 1, page_size: 100, next_page: null, last_page: 11 }],
    ['next_page omitted', { page: 1, page_size: 100, last_page: 11 }],
  ])('last_page > page alone (%s) marks the response incomplete', async (_label, pagination) => {
    fake(100, pagination)
    const params = withPageSink({ page: 4, limit: 30 } as QueryParams)
    expect(await ids(adapter(), params)).toHaveLength(10)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })

  it('a pagination block on its last page is a complete collection', async () => {
    fake(4, { page: 1, page_size: 100, next_page: null, last_page: 1, result_count: 4 })
    const params = withPageSink({ page: 2, limit: 2 } as QueryParams)
    expect(await ids(adapter(), params)).toEqual(['3', '4'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(4)
  })
})
