/**
 * SmartSuite list paging: listTasks and listProjects serve the caller's page.
 *
 * POST /api/v1/applications/[tableId]/records/list/
 * (https://developers.smartsuite.com/docs/solution-data/records/list-records)
 * takes `offset` and `limit` as QUERY parameters:
 *   offset "For use in pagination - specify the offset value returned by the
 *          prior record response to retrieve the next page."
 *   limit  "Number of records to return per request. If not set, defaults to
 *          100. Note: Value must be less than or equal to 1000."
 * "The total number of results is contained in the total property". The
 * adapter put `limit` in the JSON body and read the offset from
 * `params.cursor`, which the router never sets, so page 2 was page 1 again.
 *
 * GET /api/v1/solutions/
 * (https://developers.smartsuite.com/docs/solution-data/solutions/list-solutions)
 * "Lists all Solutions in the Workspace." and answers a bare array with no
 * paging parameter: the whole collection, paged locally.
 *
 * The fake upstream below honours ONLY the documented parameters and answers
 * at the seam every SmartSuite request crosses, axios's transport.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { SmartsuiteAdapter } from '../../../../../../src/verticals/projects/adapters/smartsuite/index'

const ORIGIN = 'https://app.smartsuite.com'
const TABLE = 'tbl1'
const RECORDS = `/api/v1/applications/${TABLE}/records/list/`
const SOLUTIONS = '/api/v1/solutions/'
const MAX_LIMIT = 1000
const RECORD_PARAMS = new Set(['offset', 'limit', 'all'])

const adapter = new SmartsuiteAdapter()
const CREDS = { accessToken: 'key', extra: { accountId: 'ws1' } }

let seen: Array<{ url: URL; body: unknown }> = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `r${i + 1}`)

type TotalMode = 'collection' | 'page' | 'absent'

function fakeSmartsuite(counts: { records?: number; solutions?: number; total?: TotalMode }): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    seen.push({ url, body })
    if (url.origin !== ORIGIN) throw httpError(404, { detail: `no host ${url.origin}` })
    const q = url.searchParams
    let data: unknown
    if (url.pathname === RECORDS && config.method === 'post') {
      for (const k of q.keys())
        if (!RECORD_PARAMS.has(k)) throw httpError(400, { detail: `unknown ${k}` })
      const n = counts.records ?? 0
      const limit = q.has('limit') ? Number(q.get('limit')) : 100
      if (limit > MAX_LIMIT) throw httpError(400, { detail: 'limit must be <= 1000' })
      const offset = Number(q.get('offset') ?? 0)
      const items = ids(n)
        .slice(offset, offset + limit)
        .map((id) => ({ id, title: id }))
      const mode = counts.total ?? 'collection'
      data =
        mode === 'absent'
          ? { offset, limit, items }
          : { total: mode === 'page' ? items.length : n, offset, limit, items }
    } else if (url.pathname === SOLUTIONS && config.method === 'get') {
      if ([...q.keys()].some((k) => k !== 'fields'))
        throw httpError(400, { detail: 'unknown parameter' })
      data = ids(counts.solutions ?? 0).map((id) => ({ id, name: `s ${id}` }))
    } else {
      throw httpError(404, { detail: `no route ${config.method} ${url.pathname}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listTasks' | 'listProjects'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listTasks':
      return (await adapter.listTasks(CREDS, TABLE, params)).map((r) => r.id)
    case 'listProjects':
      return (await adapter.listProjects(CREDS, params)).map((r) => r.id)
  }
}

async function syncPage(
  method: Method,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page, limit })
  const got = await call(method, params)
  return { ids: got, hasMore: readUpstreamPage(params)?.hasMore }
}

const METHODS: Array<[Method, (n: number) => { records?: number; solutions?: number }]> = [
  ['listTasks', (n) => ({ records: n })],
  ['listProjects', (n) => ({ solutions: n })],
]

describe.each(METHODS)('smartsuite %s serves the caller page', (method, counts) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeSmartsuite(counts(2 * L + 1))
    const all = ids(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeSmartsuite(counts(2 * L))
    expect(await syncPage(method, 2, L)).toEqual({ ids: ids(2 * L).slice(L), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeSmartsuite(counts(1201))
    const out: string[] = []
    for (let page = 1; page < 10; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(ids(1201))
  })

  // SmartSuite declares no maxPageSize (List Comments has no documented page
  // size), so the router passes no adapter maximum here.
  it('pages through the API path', async () => {
    fakeSmartsuite(counts(45))
    const params = parseListQuery({ limit: '20', page: '2' })
    const env = listPage(await call(method, params), params, 'smartsuite')
    expect(env.data).toEqual(ids(45).slice(20, 40))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('smartsuite listTasks pages by offset + limit', () => {
  it('sends the documented offset and limit as query parameters on page 2', async () => {
    fakeSmartsuite({ records: 21 })
    await syncPage('listTasks', 2, 10)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.url.searchParams.get('offset')).toBe('10')
    expect(seen[0]!.url.searchParams.get('limit')).toBe('10')
  })

  it('clamps a limit above 1000 on a direct call and reports the size it paged at', async () => {
    fakeSmartsuite({ records: 2500 })
    const all = ids(2500)
    expect(await syncPage('listTasks', 1, 5000)).toEqual({ ids: all.slice(0, 1000), hasMore: true })
    expect(await syncPage('listTasks', 2, 5000)).toEqual({
      ids: all.slice(1000, 2000),
      hasMore: true,
    })
    const p3 = withPageSink({ page: 3, limit: 5000 })
    expect(await call('listTasks', p3)).toEqual(all.slice(2000))
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false, pageSize: 1000, totalCount: 2500 })
    for (const s of seen) expect(s.url.searchParams.get('limit')).toBe('1000')
  })

  it('reports the upstream total', async () => {
    fakeSmartsuite({ records: 21 })
    const params = parseListQuery({ limit: '10', page: '1' })
    const env = listPage(await call('listTasks', params), params, 'smartsuite')
    expect(env.meta.totalCount).toBe(21)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('smartsuite listProjects is paged locally', () => {
  it('reports pagedLocally and the total from one whole-collection fetch', async () => {
    fakeSmartsuite({ solutions: 5 })
    const params = withPageSink({ page: 1, limit: 2 })
    await call('listProjects', params)
    expect(seen).toHaveLength(1)
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 5,
      hasMore: true,
    })
  })
})

// The records doc reads `total` two ways ("The total number of results is
// contained in the total property" vs "Total number of records returned"),
// and a response may omit it. Every reading must still page to the end.
describe.each<TotalMode>(['collection', 'page', 'absent'])(
  'smartsuite listTasks with total read as %s',
  (mode) => {
    it('serves every row once and stops on the short page', async () => {
      fakeSmartsuite({ records: 25, total: mode })
      const out: string[] = []
      let pages = 0
      for (let page = 1; page < 10; page++) {
        const { ids: got, hasMore } = await syncPage('listTasks', page, 10)
        pages++
        out.push(...got)
        if (hasMore === false) break
        expect(hasMore).toBe(true)
      }
      expect(out).toEqual(ids(25))
      expect(pages).toBe(3)
    })

    it('reports hasMore true on a full page and false on a short page', async () => {
      fakeSmartsuite({ records: 15, total: mode })
      expect((await syncPage('listTasks', 1, 10)).hasMore).toBe(true)
      expect((await syncPage('listTasks', 2, 10)).hasMore).toBe(false)
    })
  },
)

describe('smartsuite listTasks request shape', () => {
  it('sends an empty body, keeping limit out of it', async () => {
    fakeSmartsuite({ records: 3 })
    await syncPage('listTasks', 1, 10)
    expect(seen[0]!.body).toEqual({})
  })

  it('sends the documented default of 100 when the caller gives no limit', async () => {
    fakeSmartsuite({ records: 3 })
    await call('listTasks', withPageSink({ page: 1 } as QueryParams))
    expect(seen[0]!.url.searchParams.get('limit')).toBe('100')
    expect(seen[0]!.url.searchParams.get('offset')).toBe('0')
  })
})

describe('smartsuite listWorkspaces serves its one synthesized row once', () => {
  it('returns the workspace on page 1 and nothing on page 2', async () => {
    const p1 = withPageSink({ page: 1, limit: 10 })
    expect((await adapter.listWorkspaces(CREDS, p1)).map((w) => w.id)).toEqual(['ws1'])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: false, pagedLocally: true })
    const p2 = withPageSink({ page: 2, limit: 10 })
    expect(await adapter.listWorkspaces(CREDS, p2)).toEqual([])
  })
})
