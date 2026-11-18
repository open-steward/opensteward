/**
 * Fibery list paging: listUsers and listComments serve the caller's page.
 *
 * Every read is a `fibery.entity/query` command POSTed to /api/commands.
 * Query Entities (https://developers.fibery.com/guides/http-api/query-entities):
 *   q/offset "How many Entities to skip — useful for pagination."
 *   q/limit  "How many Entities to return."
 * Each page is asked for at exactly the caller's limit. A short page is the
 * end; a full one is followed by the same query for the one Entity after it,
 * whose presence is hasMore. (The pagination guide's sentinel, q/limit = page
 * size + 1, asks the same question by over-asking, which the paging gate fails.)
 * Neither page names a maximum for q/limit (1000 is given as an example of a
 * bounded value), so the adapter declares no `maxPageSize` and nothing clamps.
 *
 * Both methods sent the same q/limit with no q/offset for every page, so page 2
 * was page 1 again. The fake upstream below honours ONLY the documented query
 * clauses and answers at the seam every Fibery request crosses, axios's
 * transport.
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
import { FiberyAdapter } from '../../../../../../src/verticals/projects/adapters/fibery/index'

const ORIGIN = 'https://acme.fibery.io'
const COMMANDS = '/api/commands'
const PARENT = 'task-1'
const OTHER_PARENT = 'task-2'
const QUERY_KEYS = new Set(['q/from', 'q/select', 'q/where', 'q/order-by', 'q/limit', 'q/offset'])

const adapter = new FiberyAdapter()
const CREDS = { accessToken: 'tok', extra: { account: 'acme' } }

interface Counts {
  users?: number
  comments?: number
  /** Comments on another parent, interleaved by id with the target's. */
  otherComments?: number
}

type Query = Record<string, unknown>
let seen: Query[] = []
let posts = 0
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const pad = (i: number): string => String(i).padStart(4, '0')
const userIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `u-${pad(i + 1)}`)
const commentIds = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `c-${pad(2 * i + 1)}`)

function rowsFor(from: unknown, counts: Counts): Record<string, unknown>[] {
  if (from === 'fibery/user')
    return userIds(counts.users ?? 0).map((id) => ({
      'fibery/id': id,
      'user/name': id,
      'user/email': `${id}@x.test`,
    }))
  if (from === 'comments/comment') {
    const mine = commentIds(counts.comments ?? 0).map((id) => ({ id, parent: PARENT }))
    const other = Array.from({ length: counts.otherComments ?? 0 }, (_, i) => ({
      id: `c-${pad(2 * i + 2)}`,
      parent: OTHER_PARENT,
    }))
    return [...mine, ...other].map(({ id, parent }) => ({
      'fibery/id': id,
      'fibery/public-id': id,
      'fibery/creation-date': '2026-01-01T00:00:00.000Z',
      'comments/parent': { 'fibery/id': parent },
    }))
  }
  throw httpError(400, { message: `no database ${String(from)}` })
}

function applyWhere(rows: Record<string, unknown>[], where: unknown, params: Query) {
  if (where === undefined) return rows
  const w = where as unknown[]
  const bound = (v: unknown) => (typeof v === 'string' && v.startsWith('$') ? params[v] : v)
  if (w[0] === '=' && JSON.stringify(w[1]) === JSON.stringify(['comments/parent', 'fibery/id']))
    return rows.filter(
      (r) => (r['comments/parent'] as { 'fibery/id': string })['fibery/id'] === bound(w[2]),
    )
  throw httpError(400, { message: `unsupported where ${JSON.stringify(where)}` })
}

function fakeFibery(counts: Counts): void {
  seen = []
  posts = 0
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    if (url.origin !== ORIGIN || url.pathname !== COMMANDS || config.method !== 'post')
      throw httpError(404, { message: `no route ${config.method} ${url.href}` })
    posts++
    const cmds = JSON.parse(config.data as string) as Array<{ command: string; args: Query }>
    const data = cmds.map(({ command, args }) => {
      if (command !== 'fibery.entity/query') throw httpError(400, { message: command })
      const query = args['query'] as Query
      const params = (args['params'] ?? {}) as Query
      seen.push(query)
      for (const k of Object.keys(query))
        if (!QUERY_KEYS.has(k)) throw httpError(400, { message: `unknown clause ${k}` })
      const limit = query['q/limit']
      if (typeof limit !== 'number') throw httpError(400, { message: 'q/limit is required' })
      const offset = (query['q/offset'] as number | undefined) ?? 0
      const rows = applyWhere(rowsFor(query['q/from'], counts), query['q/where'], params).sort(
        (a, b) => String(a['fibery/id']).localeCompare(String(b['fibery/id'])),
      )
      return { success: true, result: rows.slice(offset, offset + limit) }
    })
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listUsers' | 'listComments'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listUsers':
      return (await adapter.listUsers(CREDS, 'ws-1', params)).map((r) => r.id)
    case 'listComments':
      return (await adapter.listComments(CREDS, PARENT, params)).map((r) => r.id)
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
  ['listUsers', (n) => ({ users: n }), userIds],
  ['listComments', (n) => ({ comments: n, otherComments: n }), commentIds],
]

describe.each(METHODS)('fibery %s serves the caller page', (method, counts, expected) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeFibery(counts(2 * L + 1))
    const all = expected(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeFibery(counts(2 * L))
    const all = expected(2 * L)
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L), hasMore: false })
  })

  it('sends the documented q/offset and exactly the caller limit on page 2', async () => {
    fakeFibery(counts(2 * L + 1))
    await syncPage(method, 2, L)
    expect(posts).toBe(2)
    expect(seen).toHaveLength(2)
    expect(seen[0]).toMatchObject({ 'q/offset': L, 'q/limit': L })
    expect(seen[0]!['q/order-by']).toEqual([['fibery/id', 'q/asc']])
    expect(seen[1]).toMatchObject({ 'q/offset': 2 * L, 'q/limit': 1 })
    expect(seen[1]!['q/order-by']).toEqual([['fibery/id', 'q/asc']])
    expect(seen[1]!['q/where']).toEqual(seen[0]!['q/where'])
  })

  it('asks nothing more after a short page', async () => {
    fakeFibery(counts(2 * L + 1))
    expect((await syncPage(method, 3, L)).hasMore).toBe(false)
    expect(posts).toBe(1)
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeFibery(counts(1100))
    const out: string[] = []
    for (let page = 1; page < 50; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(expected(1100))
  })

  it('pages through the API path', async () => {
    fakeFibery(counts(45))
    // No adapter argument: Fibery declares no page maximum for the router to read.
    const params = parseListQuery({ limit: '20', page: '2' })
    const env = listPage(await call(method, params), params, 'fibery')
    expect(env.data).toEqual(expected(45).slice(20, 40))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('fibery page size', () => {
  it('declares no maximum: the docs name none, so a large limit is sent as asked', async () => {
    expect(
      (adapter as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
    fakeFibery({ users: 3 })
    await syncPage('listUsers', 1, 2000)
    expect(seen[0]!['q/limit']).toBe(2000)
  })
})
