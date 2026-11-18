/**
 * SeaTable list methods serve the caller's page `page` at `limit`.
 *
 * listTasks — GET /api-gateway/api/v2/dtables/{base_uuid}/rows/
 * (https://api.seatable.com/reference/listrows):
 *   start "Starting position (number) of the returned rows. 0 by default."
 *   limit "Number of rows that should be returned. 1000 by default."
 *         (schema: minimum 1, maximum 1000)
 * The adapter sent start=0 on every page, so page 2 was page 1 again.
 *
 * listUsers — GET /api-gateway/api/v2/dtables/{base_uuid}/related-users/
 * (https://api.seatable.com/reference/listcollaborators): "List all
 * collaborators of a base with name, email address and avatar." No paging
 * parameters, so the whole list is sliced locally.
 *
 * The fake upstream below honours ONLY the documented parameters and answers
 * at axios's transport.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { SeatableAdapter } from '../../../../../../src/verticals/projects/adapters/seatable/index'

const ORIGIN = 'https://cloud.seatable.io'
const BASE = '11111111-2222-3333-4444-555555555555'
const TOKEN_PATH = '/api/v2.1/dtable/app-access-token/'
const ROWS_PATH = `/api-gateway/api/v2/dtables/${BASE}/rows/`
const USERS_PATH = `/api-gateway/api/v2/dtables/${BASE}/related-users/`
const MAX_LIMIT = 1000
const ROWS_DOCUMENTED = new Set([
  'table_name',
  'table_id',
  'view_name',
  'view_id',
  'start',
  'limit',
  'convert_keys',
])

const adapter = new SeatableAdapter()
const CREDS = { accessToken: 'api-token' }

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const ids = (n: number, prefix = 'r'): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

function fakeSeatable(rows: number, users = 0): void {
  seen = []
  const table = ids(rows).map((id) => ({ _id: id, Name: id }))
  const userList = ids(users, 'u').map((id) => ({ email: `${id}@auth.local`, name: id }))
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    const ok = (data: unknown) => ({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    })
    if (url.origin !== ORIGIN) throw httpError(404, { error: `no host ${url.origin}` })
    if (url.pathname === TOKEN_PATH) return ok({ access_token: 'base-token', dtable_uuid: BASE })
    const auth = String(config.headers?.Authorization ?? '')
    if (auth !== 'Bearer base-token') throw httpError(401, { error: 'base token required' })
    const q = url.searchParams
    if (url.pathname === USERS_PATH) {
      if ([...q.keys()].length) throw httpError(400, { error: 'no query parameters' })
      return ok({ user_list: userList })
    }
    if (url.pathname !== ROWS_PATH) throw httpError(404, { error: `no route ${url.pathname}` })
    for (const k of q.keys())
      if (!ROWS_DOCUMENTED.has(k)) throw httpError(400, { error: `unknown ${k}` })
    if (!q.get('table_name') && !q.get('table_id'))
      throw httpError(400, { error: 'table_name is required' })
    const limit = q.has('limit') ? Number(q.get('limit')) : MAX_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
      throw httpError(400, { error: `limit must be between 1 and ${MAX_LIMIT}` })
    const start = q.has('start') ? Number(q.get('start')) : 0
    return ok({ rows: table.slice(start, start + limit) })
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

beforeEach(() => {
  _resetRowPager()
})

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

async function tasks(params: QueryParams): Promise<string[]> {
  return (await adapter.listTasks(CREDS, BASE, params)).map((t) => t.id)
}

async function users(params: QueryParams): Promise<string[]> {
  return (await adapter.listUsers(CREDS, BASE, params)).map((u) => u.name)
}

async function syncPage(
  list: (p: QueryParams) => Promise<string[]>,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page, limit })
  const got = await list(params)
  return { ids: got, hasMore: readUpstreamPage(params)?.hasMore }
}

const rowRequests = (): URL[] => seen.filter((u) => u.pathname === ROWS_PATH)

describe('seatable listTasks pages by start + limit', () => {
  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    const L = 10
    fakeSeatable(2 * L + 1)
    const all = ids(2 * L + 1)
    expect(await syncPage(tasks, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(tasks, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(tasks, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('serves 2L+1 rows at L = the documented maximum, each once, hasMore exact', async () => {
    const L = MAX_LIMIT
    fakeSeatable(2 * L + 1)
    const all = ids(2 * L + 1)
    expect(await syncPage(tasks, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(tasks, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(tasks, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeSeatable(20)
    expect(await syncPage(tasks, 2, 10)).toEqual({ ids: ids(20).slice(10), hasMore: false })
  })

  it('the page-2 request carries the documented start', async () => {
    fakeSeatable(25)
    await syncPage(tasks, 2, 10)
    const page2 = rowRequests().find((u) => u.searchParams.get('start') === '10')
    expect(page2).toBeDefined()
    expect(page2!.searchParams.get('limit')).toBe('10')
    expect(page2!.searchParams.get('table_name')).toBe('Table1')
  })

  it('clamps a limit above 1000 on every request and still serves the caller limit', async () => {
    fakeSeatable(2500)
    const all = ids(2500)
    const out: string[] = []
    for (let page = 1; page < 10; page++) {
      const { ids: got, hasMore } = await syncPage(tasks, page, 1500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(all)
    for (const s of rowRequests())
      expect(Number(s.searchParams.get('limit'))).toBeLessThanOrEqual(MAX_LIMIT)
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeSeatable(1234)
    const out: string[] = []
    for (let page = 1; page < 20; page++) {
      const { ids: got, hasMore } = await syncPage(tasks, page, 500)
      out.push(...got)
      if (hasMore === false) break
    }
    expect(out).toEqual(ids(1234))
  })

  it('pages through the API path', async () => {
    fakeSeatable(45)
    const params = parseListQuery({ limit: '20', page: '2' })
    const env = listPage(await tasks(params), params, 'seatable')
    expect(env.data).toEqual(ids(45).slice(20, 40))
    expect(env.meta.limit).toBe(20)
    expect(env.meta.hasMore).toBe(true)
  })

  it('an empty table is an empty last page', async () => {
    fakeSeatable(0)
    expect(await syncPage(tasks, 1, 10)).toEqual({ ids: [], hasMore: false })
  })
})

describe('seatable listUsers slices the whole collaborator list', () => {
  it('serves 2L+1 users over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    const L = 4
    fakeSeatable(0, 2 * L + 1)
    const all = ids(2 * L + 1, 'u')
    expect(await syncPage(users, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(users, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(users, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('pages through the API path', async () => {
    fakeSeatable(0, 30)
    const params = parseListQuery({ limit: '20', page: '2' })
    const env = listPage(await users(params), params, 'seatable')
    expect(env.data).toEqual(ids(30, 'u').slice(20))
    expect(env.meta.hasMore).toBe(false)
  })
})

/**
 * Two connections, bases and tables on one server. Each API token exchanges
 * for its own base token, and each base token reads only its own base. Rows
 * are named after the table they come from, so a row served from the wrong
 * pager entry is visible in the output.
 */
const BASE_B = '99999999-8888-7777-6666-555555555555'
const CREDS_B = { accessToken: 'api-token-b' }

function fakeMulti(tables: Record<string, number>): void {
  seen = []
  const tokens: Record<string, string> = {
    'Bearer api-token': 'base-token-a',
    'Bearer api-token-b': 'base-token-b',
  }
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    const ok = (data: unknown) => ({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    })
    if (url.origin !== ORIGIN) throw httpError(404, { error: `no host ${url.origin}` })
    const auth = String(config.headers?.Authorization ?? '')
    if (url.pathname === TOKEN_PATH) {
      const tok = tokens[auth]
      if (!tok) throw httpError(401, { error: 'api token required' })
      return ok({ access_token: tok })
    }
    const m = /^\/api-gateway\/api\/v2\/dtables\/([^/]+)\/rows\/$/.exec(url.pathname)
    if (!m) throw httpError(404, { error: `no route ${url.pathname}` })
    const q = url.searchParams
    for (const k of q.keys())
      if (!ROWS_DOCUMENTED.has(k)) throw httpError(400, { error: `unknown ${k}` })
    const tableKey = `${auth.replace('Bearer ', '')}|${m[1]}|${q.get('table_name')}`
    const count = tables[tableKey]
    if (count === undefined) throw httpError(404, { error: `no table ${tableKey}` })
    const limit = q.has('limit') ? Number(q.get('limit')) : MAX_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
      throw httpError(400, { error: `limit must be between 1 and ${MAX_LIMIT}` })
    const start = q.has('start') ? Number(q.get('start')) : 0
    const label = `${tableKey}#`
    const rows = ids(count, label).map((id) => ({ _id: id, Name: id }))
    return ok({ rows: rows.slice(start, start + limit) })
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

const rowsOf = (key: string, n: number): string[] => ids(n, `${key}#`)

async function page(
  creds: { accessToken: string },
  base: string,
  table: string,
  p: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page: p, limit, table_name: table })
  const got = (await adapter.listTasks(creds, base, params)).map((t) => t.id)
  return { ids: got, hasMore: readUpstreamPage(params)?.hasMore }
}

describe('seatable listTasks keeps one walk per connection, base, table and size', () => {
  it('two connections on one server, same base and table name, each get only their rows', async () => {
    const A = `base-token-a|${BASE}|Table1`
    const B = `base-token-b|${BASE}|Table1`
    fakeMulti({ [A]: 21, [B]: 21 })
    const a = rowsOf(A, 21)
    const b = rowsOf(B, 21)
    expect(await page(CREDS, BASE, 'Table1', 1, 10)).toEqual({ ids: a.slice(0, 10), hasMore: true })
    expect(await page(CREDS_B, BASE, 'Table1', 1, 10)).toEqual({
      ids: b.slice(0, 10),
      hasMore: true,
    })
    expect(await page(CREDS, BASE, 'Table1', 2, 10)).toEqual({
      ids: a.slice(10, 20),
      hasMore: true,
    })
    expect(await page(CREDS_B, BASE, 'Table1', 2, 10)).toEqual({
      ids: b.slice(10, 20),
      hasMore: true,
    })
  })

  it('two tables of one base, walked in turn, each get only their rows', async () => {
    const T1 = `base-token-a|${BASE}|Table1`
    const T2 = `base-token-a|${BASE}|Table2`
    fakeMulti({ [T1]: 21, [T2]: 21 })
    expect(await page(CREDS, BASE, 'Table1', 1, 10)).toEqual({
      ids: rowsOf(T1, 21).slice(0, 10),
      hasMore: true,
    })
    expect(await page(CREDS, BASE, 'Table2', 1, 10)).toEqual({
      ids: rowsOf(T2, 21).slice(0, 10),
      hasMore: true,
    })
    expect(await page(CREDS, BASE, 'Table1', 2, 10)).toEqual({
      ids: rowsOf(T1, 21).slice(10, 20),
      hasMore: true,
    })
    expect(await page(CREDS, BASE, 'Table2', 2, 10)).toEqual({
      ids: rowsOf(T2, 21).slice(10, 20),
      hasMore: true,
    })
  })

  it('two bases with the same table name, walked in turn, each get only their rows', async () => {
    const X = `base-token-a|${BASE}|Table1`
    const Y = `base-token-a|${BASE_B}|Table1`
    fakeMulti({ [X]: 21, [Y]: 21 })
    expect(await page(CREDS, BASE, 'Table1', 1, 10)).toEqual({
      ids: rowsOf(X, 21).slice(0, 10),
      hasMore: true,
    })
    expect(await page(CREDS, BASE_B, 'Table1', 1, 10)).toEqual({
      ids: rowsOf(Y, 21).slice(0, 10),
      hasMore: true,
    })
    expect(await page(CREDS, BASE, 'Table1', 2, 10)).toEqual({
      ids: rowsOf(X, 21).slice(10, 20),
      hasMore: true,
    })
    expect(await page(CREDS, BASE_B, 'Table1', 2, 10)).toEqual({
      ids: rowsOf(Y, 21).slice(10, 20),
      hasMore: true,
    })
  })

  it('a walk at L=25 after one at L=10 sends only start offsets on its own page grid', async () => {
    const T = `base-token-a|${BASE}|Table1`
    fakeMulti({ [T]: 60 })
    const all = rowsOf(T, 60)
    expect((await page(CREDS, BASE, 'Table1', 1, 10)).ids).toEqual(all.slice(0, 10))
    seen = []
    expect(await page(CREDS, BASE, 'Table1', 2, 25)).toEqual({
      ids: all.slice(25, 50),
      hasMore: true,
    })
    const sent = rowRequests25()
    expect(sent.length).toBeGreaterThan(0)
    for (const u of sent) {
      expect(u.searchParams.get('limit')).toBe('25')
      expect(Number(u.searchParams.get('start')) % 25).toBe(0)
    }
  })
})

const rowRequests25 = (): URL[] => seen.filter((u) => u.pathname.endsWith('/rows/'))

describe('seatable listTasks stops at a short page', () => {
  it('asks for nothing past the short last page of 2L+1 rows', async () => {
    const L = 10
    fakeSeatable(2 * L + 1)
    for (let p = 1; p <= 3; p++) await syncPage(tasks, p, L)
    const starts = rowRequests().map((u) => Number(u.searchParams.get('start')))
    expect(starts.length).toBeGreaterThan(0)
    expect(Math.max(...starts)).toBe(2 * L)
  })
})

describe('seatable listTasks with an explicit upstream cursor', () => {
  it('reads from that start offset at the caller limit', async () => {
    fakeSeatable(40)
    expect(await tasks({ cursor: '15', limit: 10 })).toEqual(ids(40).slice(15, 25))
    const sent = rowRequests()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('start')).toBe('15')
    expect(sent[0]!.searchParams.get('limit')).toBe('10')
  })

  it('rejects a non-numeric limit instead of sending limit=NaN', async () => {
    fakeSeatable(40)
    await expect(tasks({ cursor: '15', limit: 'ten' as unknown as number })).rejects.toBeInstanceOf(
      RangeError,
    )
    expect(rowRequests()).toHaveLength(0)
  })
})
