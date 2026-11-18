/**
 * Baserow list paging: every list serves the caller's page `page` at `limit`.
 *
 * GET /api/database/rows/table/{table_id}/ (list_database_table_rows in
 * https://api.baserow.io/api/schema.json) "The response is paginated by a
 * page/size style.":
 *   page  "Defines which page of rows should be returned."
 *   size  "Defines how many rows should be returned per page."
 * and answers `{ count, next, previous, results }`, `next` being "URL to the
 * next page." (nullable). Baserow's paginator
 * (https://gitlab.com/baserow/baserow/-/raw/develop/backend/src/baserow/api/pagination.py)
 * refuses a larger size with ERROR_PAGE_SIZE_LIMIT, "The page size is limited
 * to {limit}.", and the rows view passes `settings.ROW_PAGE_SIZE_LIMIT`, which
 * defaults to 200. The adapter read the page from `params.cursor`, which the
 * router never sets, so page 2 was page 1 again.
 *
 * GET /api/workspaces/ ("Lists all the workspaces of the authorized user.",
 * users embedded as "List of all workspace users.") and GET /api/applications/
 * ("Lists all the applications that the user has access to.") take no query
 * parameters and return a bare array: the whole collection, paged locally.
 *
 * The fake upstream below honours ONLY the documented parameters and answers
 * at the seam every Baserow request crosses, axios's transport.
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
import { BaserowAdapter } from '../../../../../../src/verticals/projects/adapters/baserow/index'

const ORIGIN = 'https://api.baserow.io'
const TABLE = '42'
const ROWS = `/api/database/rows/table/${TABLE}/`
const WORKSPACES = '/api/workspaces/'
const APPLICATIONS = '/api/applications/'
const WS_ID = '7'
const ROW_PAGE_SIZE_LIMIT = 200
const ROW_PARAMS = new Set(['page', 'size'])

const adapter = new BaserowAdapter()
const CREDS = { accessToken: 'db_token' }

interface Counts {
  rows?: number
  workspaces?: number
  users?: number
  applications?: number
  /** Non-database applications (e.g. builder), interleaved after each database one. */
  otherApps?: number
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const ids = (n: number, start = 1): string[] =>
  Array.from({ length: n }, (_, i) => String(start + i))

function fakeBaserow(counts: Counts): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN) throw httpError(404, { detail: `no host ${url.origin}` })
    const q = url.searchParams
    let data: unknown
    if (url.pathname === ROWS) {
      for (const k of q.keys())
        if (!ROW_PARAMS.has(k)) throw httpError(400, { detail: `unknown ${k}` })
      const n = counts.rows ?? 0
      const size = q.has('size') ? Number(q.get('size')) : 100
      if (size > ROW_PAGE_SIZE_LIMIT)
        throw httpError(400, {
          error: 'ERROR_PAGE_SIZE_LIMIT',
          detail: `The page size is limited to ${ROW_PAGE_SIZE_LIMIT}.`,
        })
      const page = Math.max(1, Number(q.get('page') ?? 1) || 1)
      const start = (page - 1) * size
      const results = ids(n)
        .slice(start, start + size)
        .map((id) => ({ id: Number(id), order: id }))
      data = {
        count: n,
        next: start + size < n ? `${ORIGIN}${ROWS}?page=${page + 1}&size=${size}` : null,
        previous: page > 1 ? `${ORIGIN}${ROWS}?page=${page - 1}&size=${size}` : null,
        results,
      }
    } else if (url.pathname === WORKSPACES || url.pathname === APPLICATIONS) {
      if ([...q.keys()].length > 0) throw httpError(400, { detail: 'takes no query parameters' })
      if (url.pathname === WORKSPACES) {
        const n = counts.workspaces ?? 1
        data = ids(n, Number(WS_ID)).map((id) => ({
          id: Number(id),
          name: `ws ${id}`,
          users:
            id === WS_ID
              ? ids(counts.users ?? 0).map((u) => ({
                  id: Number(u),
                  name: `u${u}`,
                  email: `u${u}@x.test`,
                }))
              : [],
        }))
      } else {
        const others = counts.otherApps ?? 0
        data = ids(counts.applications ?? 0).flatMap((id, i) => [
          { id: Number(id), name: `db ${id}`, type: 'database' },
          ...(i < others ? [{ id: 1000 + i, name: `app ${i}`, type: 'builder' }] : []),
        ])
      }
    } else {
      throw httpError(404, { detail: `no route ${url.pathname}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listTasks' | 'listWorkspaces' | 'listUsers' | 'listProjects'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listTasks':
      return (await adapter.listTasks(CREDS, TABLE, params)).map((r) => r.id)
    case 'listUsers':
      return (await adapter.listUsers(CREDS, WS_ID, params)).map((r) => r.id)
    case 'listWorkspaces':
      return (await adapter.listWorkspaces(CREDS, params)).map((r) => r.id)
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
  ['listTasks', (n) => ({ rows: n }), (n) => ids(n)],
  ['listUsers', (n) => ({ users: n }), (n) => ids(n)],
  ['listWorkspaces', (n) => ({ workspaces: n }), (n) => ids(n, Number(WS_ID))],
  ['listProjects', (n) => ({ applications: n }), (n) => ids(n)],
]

describe.each(METHODS)('baserow %s serves the caller page', (method, counts, expected) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeBaserow(counts(2 * L + 1))
    const all = expected(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeBaserow(counts(2 * L))
    const all = expected(2 * L)
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeBaserow(counts(450))
    const out: string[] = []
    for (let page = 1; page < 50; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, ROW_PAGE_SIZE_LIMIT)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(expected(450))
  })

  it('pages through the API path at the declared maximum', async () => {
    fakeBaserow(counts(450))
    const params = parseListQuery({ limit: '500', page: '2' }, adapter)
    const env = listPage(await call(method, params), params, 'baserow')
    expect(env.data).toEqual(expected(450).slice(200, 400))
    expect(env.meta.limit).toBe(ROW_PAGE_SIZE_LIMIT)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('baserow listTasks pages by page + size', () => {
  it('declares the rows endpoint maximum', () => {
    expect(adapter.capabilities.maxPageSize).toBe(ROW_PAGE_SIZE_LIMIT)
  })

  it('sends the documented page and size on page 2', async () => {
    fakeBaserow({ rows: 21 })
    await syncPage('listTasks', 2, 10)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.searchParams.get('page')).toBe('2')
    expect(seen[0]!.searchParams.get('size')).toBe('10')
  })

  it('clamps a limit above 200 on a direct call and reports the size it paged at', async () => {
    fakeBaserow({ rows: 450 })
    const all = ids(450)
    expect(await syncPage('listTasks', 1, 500)).toEqual({ ids: all.slice(0, 200), hasMore: true })
    expect(await syncPage('listTasks', 2, 500)).toEqual({ ids: all.slice(200, 400), hasMore: true })
    const p3 = withPageSink({ page: 3, limit: 500 })
    expect(await call('listTasks', p3)).toEqual(all.slice(400))
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false, pageSize: 200, totalCount: 450 })
    for (const s of seen) expect(s.searchParams.get('size')).toBe('200')
  })

  it('reports the upstream count', async () => {
    fakeBaserow({ rows: 21 })
    const params = parseListQuery({ limit: '10', page: '1' }, adapter)
    const env = listPage(await call('listTasks', params), params, 'baserow')
    expect(env.meta.totalCount).toBe(21)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('baserow whole-collection lists are paged locally', () => {
  it.each(['listUsers', 'listWorkspaces', 'listProjects'] as const)(
    '%s reports pagedLocally and the total',
    async (method) => {
      fakeBaserow({ users: 5, workspaces: 5, applications: 5 })
      const params = withPageSink({ page: 1, limit: 2 })
      await call(method, params)
      expect(readUpstreamPage(params)).toMatchObject({
        pagedLocally: true,
        totalCount: 5,
        hasMore: true,
      })
    },
  )

  it('listProjects filters to database applications before slicing, so pages stay full', async () => {
    fakeBaserow({ applications: 5, otherApps: 5 })
    const p1 = withPageSink({ page: 1, limit: 2 })
    expect((await adapter.listProjects(CREDS, p1)).map((r) => r.id)).toEqual(['1', '2'])
    const p3 = withPageSink({ page: 3, limit: 2 })
    expect((await adapter.listProjects(CREDS, p3)).map((r) => r.id)).toEqual(['5'])
    expect(readUpstreamPage(p1)).toMatchObject({ totalCount: 5, hasMore: true })
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
  })

  it('listUsers of an unknown workspace is an empty last page', async () => {
    fakeBaserow({ users: 5 })
    const params = withPageSink({ page: 1, limit: 2 })
    expect(await adapter.listUsers(CREDS, '999', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
