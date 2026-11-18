/**
 * ProductPlan's v2 list endpoints page by page number
 * (https://productplan.readme.io/reference/get_api-v2-roadmaps.md): `page`
 * "Indicates which page number to retrieve (based on a given page size)" and
 * `page_size` "The amount of items to return with each page (default: 200,
 * max: 500)". Each response carries `paging` with `record_count` ("The total
 * number of elements existing in the collection (pre-paging)"), `page_count`
 * ("The total number of pages") and `current_page`. The same two parameters and
 * the same `paging` object are documented for `/roadmaps/{id}/bars`,
 * `/bars/{id}/comments` and `/users`.
 *
 * listProjects, listTasks, listComments and listUsers used to send `page` only
 * from `params.cursor`, so caller page 2 repeated page 1. The fake honours ONLY
 * `page` and `page_size` and refuses a `page_size` past the documented max.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ProductplanAdapter } from '../../../../../../src/verticals/projects/adapters/productplan/index'

vi.mock('axios')

const C: Credentials = { accessToken: 'tok', extra: {} }

/** Documented `page_size` default and maximum. */
const PP_DEFAULT = 200
const PP_MAX = 500

type Kind = 'roadmaps' | 'bars' | 'comments' | 'users'

interface Req {
  path: string
  params: Record<string, unknown>
}

function route(path: string): Kind | null {
  if (path === '/roadmaps') return 'roadmaps'
  if (/^\/roadmaps\/[^/]+\/bars$/.test(path)) return 'bars'
  if (/^\/bars\/[^/]+\/comments$/.test(path)) return 'comments'
  if (path === '/users') return 'users'
  return null
}

function fakeProductplan(total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation((() => {
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ path, params })
      const kind = route(path)
      if (!kind) throw new Error(`unexpected path ${path}`)
      const size = params['page_size'] === undefined ? PP_DEFAULT : Number(params['page_size'])
      if (!Number.isInteger(size) || size < 1 || size > PP_MAX)
        throw new Error(`page_size ${String(params['page_size'])} out of range`)
      const page = params['page'] === undefined ? 1 : Number(params['page'])
      if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(params['page'])}`)
      const all = Array.from({ length: total }, (_, i) => ({
        id: i + 1,
        name: `${kind}-${i + 1}`,
        body: `${kind}-${i + 1}`,
        email: `u${i + 1}@example.com`,
      }))
      const results = all.slice((page - 1) * size, page * size)
      return {
        data: {
          results,
          paging: {
            record_count: all.length,
            page_count: Math.ceil(all.length / size),
            current_page: page,
            page_size: results.length,
          },
        },
      }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (a: ProductplanAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: Array<[string, Lister]> = [
  ['listProjects', (a, p) => a.listProjects(C, p)],
  ['listTasks', (a, p) => a.listTasks(C, '7', p)],
  ['listComments', (a, p) => a.listComments(C, '9', p)],
  ['listUsers', (a, p) => a.listUsers(C, 'ws', p)],
]

function ids(from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(from + i + 1))
}

beforeEach(() => vi.mocked(axios.create).mockReset())
afterEach(() => vi.restoreAllMocks())

describe.each(LISTS)('productplan %s pages by page and page_size', (_name, list) => {
  it('walks 2L+1 rows over pages 1..3, every id once with exact hasMore', async () => {
    const L = 10
    fakeProductplan(2 * L + 1)
    const a = new ProductplanAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      served.push(...(await list(a, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(served).toEqual(ids(0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('an exact multiple of the page size ends on the documented page_count, not a full-page guess', async () => {
    const L = 10
    fakeProductplan(2 * L)
    const a = new ProductplanAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      served.push(...(await list(a, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(0, 2 * L))
    expect(more).toEqual([true, false])
  })

  it('with no limit, sends the documented default page_size of 200', async () => {
    const { requests } = fakeProductplan(250)
    const rows = await list(new ProductplanAdapter(), withPageSink({ page: 1 }))
    expect(requests[0]!.params).toEqual({ page: 1, page_size: PP_DEFAULT })
    expect(rows).toHaveLength(PP_DEFAULT)
  })

  it('page 2 carries the documented `page` and `page_size`', async () => {
    const { requests } = fakeProductplan(30)
    await list(new ProductplanAdapter(), withPageSink({ page: 2, limit: 7 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params).toEqual({ page: 2, page_size: 7 })
  })

  it('clamps a limit above the documented max of 500 and reports the size', async () => {
    const { requests } = fakeProductplan(1200)
    const params = withPageSink({ page: 2, limit: 800 })
    const rows = await list(new ProductplanAdapter(), params)
    expect(requests[0]!.params).toEqual({ page: 2, page_size: PP_MAX })
    expect(rows.map((r) => r.id)).toEqual(ids(PP_MAX, PP_MAX))
    expect(readUpstreamPage(params)?.pageSize).toBe(PP_MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeProductplan(230)
    const a = new ProductplanAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(a, params), params, 'productplan')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(0, 230))
  })
})
