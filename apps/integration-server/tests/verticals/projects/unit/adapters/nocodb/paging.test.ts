/**
 * NocoDB list paging: the fixed lists serve the caller's page `page` at `limit`.
 *
 * GET /api/v2/tables/{tableId}/records (NocoDB's own OpenAPI,
 * https://raw.githubusercontent.com/nocodb/nocodb/develop/packages/nocodb/src/schema/swagger-v2.json)
 * takes `offset`, "Enables you to control the pagination of your API response
 * by specifying the number of records you want to skip from the beginning of
 * the result set.", and `limit`, and answers `{ list, pageInfo }` with
 * `pageInfo.totalRows` and `isLastPage` "Is the current page the last page".
 * NocoDB's environment-variable docs give `NC_DB_QUERY_LIMIT_MAX` "Maximum
 * allowable pagination limit." "Defaults to `1000`.". The adapter read the
 * offset from `params.cursor`, which the router never sets, so page 2 was
 * page 1 again.
 *
 * GET /api/v2/meta/bases/ — "Retrieve a list of all available bases (OSS
 * version)." — documents no query parameters and returns every base (its
 * controller builds the page info from `count: bases.length, limit:
 * bases.length`): the whole collection, paged locally.
 *
 * The fake upstream below honours ONLY the documented parameters, mirrors
 * NocoDB's limit clamp and page-info arithmetic, and answers at the seam every
 * NocoDB request crosses, axios's transport.
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
import { NocodbAdapter } from '../../../../../../src/verticals/projects/adapters/nocodb/index'

const ORIGIN = 'https://app.nocodb.com'
const TABLE = 'mtable1'
const RECORDS = `/api/v2/tables/${TABLE}/records`
const BASES = '/api/v2/meta/bases/'
const LIMIT_MAX = 1000
const LIMIT_DEFAULT = 25
const RECORD_PARAMS = new Set(['fields', 'sort', 'where', 'offset', 'limit', 'viewId'])

const adapter = new NocodbAdapter()
const CREDS = { accessToken: 'nc_pat_test' }

interface Counts {
  records?: number
  bases?: number
  /** Operator's NC_DB_QUERY_LIMIT_MIN (source default 1; the env docs say 10). */
  limitMin?: number
  /** Operator's NC_DB_QUERY_LIMIT_MAX (default 1000). */
  limitMax?: number
  /** Leave `pageInfo.totalRows` out, so only `isLastPage` signals the end. */
  omitTotalRows?: boolean
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const nums = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)
const taskIds = (n: number): string[] => nums(n).map((i) => `${TABLE}:${i}`)
const baseIds = (n: number): string[] => nums(n).map((i) => `p${i}`)

/** NocoDB's PagedResponseImpl page info for `count` rows at `offset`/`limit`. */
function pageInfo(count: number, offset: number, limit: number) {
  const page = offset ? offset / limit + 1 : 1
  return {
    totalRows: count,
    page,
    pageSize: limit,
    isFirstPage: page === 1,
    isLastPage: page >= (Math.ceil(count / limit) || 1),
  }
}

function fakeNocodb(counts: Counts): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN) throw httpError(404, { msg: `no host ${url.origin}` })
    const q = url.searchParams
    let data: unknown
    if (url.pathname === RECORDS) {
      for (const k of q.keys())
        if (!RECORD_PARAMS.has(k)) throw httpError(400, { msg: `unknown ${k}` })
      const n = counts.records ?? 0
      const asked = Number(q.get('limit'))
      // The limit clamped to the operator's [NC_DB_QUERY_LIMIT_MIN, NC_DB_QUERY_LIMIT_MAX].
      const limit = Math.max(
        Math.min(
          asked > 0 && Number.isInteger(asked) ? asked : LIMIT_DEFAULT,
          counts.limitMax ?? LIMIT_MAX,
        ),
        counts.limitMin ?? 1,
      )
      const offset = Math.max(Number(q.get('offset') ?? 0) || 0, 0)
      if (offset && offset >= n)
        throw httpError(422, { msg: `Offset value '${offset}' is invalid` })
      data = {
        list: nums(n)
          .slice(offset, offset + limit)
          .map((id) => ({ Id: id, Title: `row ${id}` })),
        pageInfo: counts.omitTotalRows
          ? { ...pageInfo(n, offset, limit), totalRows: undefined }
          : pageInfo(n, offset, limit),
      }
    } else if (url.pathname === BASES || url.pathname === BASES.slice(0, -1)) {
      // Express routing is not strict: `/meta/bases` reaches the `/meta/bases/` route.
      if ([...q.keys()].length > 0) throw httpError(400, { msg: 'documents no query parameters' })
      const n = counts.bases ?? 0
      data = {
        list: baseIds(n).map((id) => ({ id, title: `base ${id}`, fk_workspace_id: 'w1' })),
        pageInfo: pageInfo(n, 0, n || 1),
      }
    } else {
      throw httpError(404, { msg: `no route ${url.pathname}` })
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

const METHODS: Array<[Method, (n: number) => Counts, (n: number) => string[]]> = [
  ['listTasks', (n) => ({ records: n }), taskIds],
  ['listProjects', (n) => ({ bases: n }), baseIds],
]

describe.each(METHODS)('nocodb %s serves the caller page', (method, counts, expected) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeNocodb(counts(2 * L + 1))
    const all = expected(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeNocodb(counts(2 * L))
    const all = expected(2 * L)
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeNocodb(counts(1234))
    const out: string[] = []
    for (let page = 1; page < 50; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(expected(1234))
  })

  it('pages through the API path', async () => {
    fakeNocodb(counts(21))
    const params = parseListQuery({ limit: '10', page: '2' }) // no declared maximum
    const env = listPage(await call(method, params), params, 'nocodb')
    expect(env.data).toEqual(expected(21).slice(10, 20))
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(21)
  })
})

describe('nocodb listTasks pages by offset + limit', () => {
  it('sends the documented offset and limit on page 2', async () => {
    fakeNocodb({ records: 21 })
    await syncPage('listTasks', 2, 10)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.searchParams.get('offset')).toBe('10')
    expect(seen[0]!.searchParams.get('limit')).toBe('10')
  })

  it('clamps a limit above 1000 and reports the size it paged at', async () => {
    fakeNocodb({ records: 2500 })
    const all = taskIds(2500)
    expect(await syncPage('listTasks', 1, 1500)).toEqual({ ids: all.slice(0, 1000), hasMore: true })
    expect(await syncPage('listTasks', 2, 1500)).toEqual({
      ids: all.slice(1000, 2000),
      hasMore: true,
    })
    const p3 = withPageSink({ page: 3, limit: 1500 })
    expect(await call('listTasks', p3)).toEqual(all.slice(2000))
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false, pageSize: 1000, totalCount: 2500 })
    for (const s of seen) expect(s.searchParams.get('limit')).toBe('1000')
    expect(seen.map((s) => s.searchParams.get('offset'))).toEqual(['0', '1000', '2000'])
  })
})

describe('nocodb listTasks against a non-default server configuration', () => {
  it('serves exactly the caller page when NC_DB_QUERY_LIMIT_MIN is above the limit', async () => {
    fakeNocodb({ records: 30, limitMin: 10 })
    const all = taskIds(30)
    expect(await syncPage('listTasks', 1, 7)).toEqual({ ids: all.slice(0, 7), hasMore: true })
    expect(await syncPage('listTasks', 2, 7)).toEqual({ ids: all.slice(7, 14), hasMore: true })
    expect(seen.map((s) => s.searchParams.get('offset'))).toEqual(['0', '7'])
  })

  it('falls back to isLastPage when the page info carries no totalRows', async () => {
    fakeNocodb({ records: 21, omitTotalRows: true })
    const all = taskIds(21)
    expect(await syncPage('listTasks', 1, 10)).toEqual({ ids: all.slice(0, 10), hasMore: true })
    expect(await syncPage('listTasks', 3, 10)).toEqual({ ids: all.slice(20), hasMore: false })
  })

  it('tops a short page up when NC_DB_QUERY_LIMIT_MAX is below the limit', async () => {
    fakeNocodb({ records: 1234, limitMax: 100 })
    const out: string[] = []
    for (let page = 1; page < 10; page++) {
      const { ids: got, hasMore } = await syncPage('listTasks', page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(got).toHaveLength(500)
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(taskIds(1234))
  })

  it('fills the page from where a short upstream page stopped', async () => {
    fakeNocodb({ records: 150, limitMax: 100 })
    expect(await syncPage('listTasks', 1, 500)).toEqual({ ids: taskIds(150), hasMore: false })
    expect(seen.map((s) => s.searchParams.get('offset'))).toEqual(['0', '100'])
  })
})

describe('nocodb listProjects without a workspace is paged locally', () => {
  it('reports pagedLocally and the total', async () => {
    fakeNocodb({ bases: 5 })
    const params = withPageSink({ page: 1, limit: 2 })
    await call('listProjects', params)
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 5,
      hasMore: true,
    })
  })
})
