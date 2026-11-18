/**
 * Redmine pages its collection resources by `offset` + `limit`
 * (https://www.redmine.org/projects/redmine/wiki/Rest_api#Collection-resources-and-pagination):
 *
 *   "offset: the offset of the first object to retrieve"
 *   "limit: the number of items to be present in the response (default is
 *    25, maximum is 100)"
 *
 * and every collection response carries `total_count`, `offset` and `limit`:
 * `{ "issues":[...], "total_count":2595, "limit":25, "offset":0 }`. So the
 * next signal is `offset + rows < total_count`.
 *
 * Journals (comments) have no collection endpoint: they come embedded, all
 * of them, in `GET /issues/:id.json?include=journals`, so the adapter pages
 * them locally.
 *
 * Every list used to read its offset only from `params.cursor`, so caller
 * page 2 repeated page 1. The fake honours ONLY the documented paging inputs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { RedmineAdapter } from '../../../../../../src/verticals/projects/adapters/redmine/index'

vi.mock('axios')

const HOST = 'https://redmine.example.test'
const C1: Credentials = { accessToken: 'key-1', extra: { host: HOST } }
const C2: Credentials = { accessToken: 'key-2', extra: { host: HOST } }

/** Documented default and maximum of `limit`. */
const REDMINE_DEFAULT = 25
const REDMINE_MAX = 100

interface Req {
  key: string
  path: string
  params: Record<string, unknown>
}

type Kind = 'projects' | 'issues' | 'users' | 'journals'

function idNum(key: string, parent: string, n: number): number {
  return (key === 'key-2' ? 100_000 : 0) + (parent === '2' ? 200_000 : 0) + n + 1
}

function row(kind: Kind, key: string, parent: string, n: number): Record<string, unknown> {
  const id = idNum(key, parent, n)
  const at = new Date(Date.UTC(2024, 0, 1) + n * 1000).toISOString()
  switch (kind) {
    case 'projects':
      return {
        id,
        name: `project ${id}`,
        identifier: `p${id}`,
        status: 1,
        created_on: at,
        updated_on: at,
      }
    case 'issues':
      return {
        id,
        subject: `issue ${id}`,
        project: { id: Number(parent) },
        status: { id: 1, name: 'New' },
        created_on: at,
        updated_on: at,
      }
    case 'users':
      return {
        id,
        login: `u${id}`,
        firstname: 'U',
        lastname: String(id),
        mail: `u${id}@example.com`,
        created_on: at,
      }
    case 'journals':
      return { id, user: { id: 1, name: 'A' }, notes: `note ${id}`, created_on: at }
  }
}

/**
 * One Redmine instance holding `total` rows per (key, parent). Collections
 * honour only `offset` and `limit` (default 25, capped at 100) and answer
 * with total_count / offset / limit. The issue endpoint returns every
 * journal; `blank` journal indexes carry no notes. `meta = false` answers
 * as an instance does to `nometa`: rows only, no total_count/offset/limit.
 */
function fakeRedmine(
  kind: Kind,
  total: number,
  requests: Req[] = [],
  blank: number[] = [],
  meta = true,
) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const key = String(config?.headers?.['X-Redmine-API-Key'] ?? '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ key, path, params })
      if (kind === 'journals') {
        const m = path.match(/^\/issues\/([^/]+)\.json$/)
        if (!m || params['include'] !== 'journals') throw new Error(`unexpected ${path}`)
        const parent = m[1]!
        const journals = Array.from({ length: total }, (_, i) => ({
          ...row(kind, key, parent, i),
          ...(blank.includes(i) ? { notes: '' } : {}),
        }))
        return { data: { issue: { id: Number(parent), journals } } }
      }
      if (path !== `/${kind}.json`) throw new Error(`unexpected path ${path}`)
      const parent = kind === 'issues' ? String(params['project_id']) : 'all'
      const all = Array.from({ length: total }, (_, i) => row(kind, key, parent, i))
      const limRaw = params['limit']
      const lim = limRaw === undefined ? REDMINE_DEFAULT : Math.min(Number(limRaw), REDMINE_MAX)
      if (!Number.isInteger(lim) || lim < 1) throw new Error(`limit ${String(limRaw)} invalid`)
      const offRaw = params['offset']
      const off = offRaw === undefined ? 0 : Number(offRaw)
      if (!Number.isInteger(off) || off < 0) throw new Error(`offset ${String(offRaw)} invalid`)
      const slice = all.slice(off, off + lim)
      return {
        data: meta
          ? { [kind]: slice, total_count: total, offset: off, limit: lim }
          : { [kind]: slice },
      }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: RedmineAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const OFFSET_LISTS: Array<[string, Kind, Lister]> = [
  ['listProjects', 'projects', (a, c, _p, p) => a.listProjects(c, p)],
  ['listTasks', 'issues', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listUsers', 'users', (a, c, parent, p) => a.listUsers(c, parent, p)],
]

const ALL_LISTS: Array<[string, Kind, Lister]> = [
  ...OFFSET_LISTS,
  ['listComments', 'journals', (a, c, parent, p) => a.listComments(c, parent, p)],
]

function parentOf(kind: Kind, parent: string): string {
  return kind === 'issues' || kind === 'journals' ? parent : 'all'
}

function ids(kind: Kind, key: string, parent: string, from: number, n: number): string[] {
  const par = parentOf(kind, parent)
  return Array.from({ length: n }, (_, i) => String(idNum(key, par, from + i)))
}

afterEach(() => vi.clearAllMocks())

describe('redmine declares the documented page maximum', () => {
  it('maxPageSize is 100', () => {
    expect(new RedmineAdapter().capabilities.maxPageSize).toBe(REDMINE_MAX)
  })
})

describe.each(ALL_LISTS)('redmine %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeRedmine(kind, 2 * L + 1)
    const adapter = new RedmineAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, '1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'key-1', '1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeRedmine(kind, 230)
    const adapter = new RedmineAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(adapter, C1, '1', params), params, 'redmine')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'key-1', '1', 0, 230))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 40
    fakeRedmine(kind, 2 * L + 1)
    const adapter = new RedmineAdapter()
    const a1 = await list(adapter, C1, '1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, '1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'key-1', '1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'key-2', '1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'key-1', '1', L, L))
  })
})

describe.each(OFFSET_LISTS)('redmine %s sends the documented offset', (_name, kind, list) => {
  it('page 2 is fetched with offset = L and limit = L', async () => {
    const L = 40
    const { requests } = fakeRedmine(kind, 2 * L + 1)
    const adapter = new RedmineAdapter()
    await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
    expect(requests.map((r) => [r.params['limit'], r.params['offset']])).toEqual([[L, L]])
    for (const r of requests) expect(r.params['cursor']).toBeUndefined()
  })

  it('a limit above 100 is clamped to 100, reported, and strides by 100', async () => {
    const L = 250
    const { requests } = fakeRedmine(kind, 2 * L + 1)
    const adapter = new RedmineAdapter()
    const p1 = withPageSink({ page: 1, limit: L })
    const r1 = await list(adapter, C1, '1', p1)
    const p2 = withPageSink({ page: 2, limit: L })
    const r2 = await list(adapter, C1, '1', p2)
    expect(r1.map((r) => r.id)).toEqual(ids(kind, 'key-1', '1', 0, REDMINE_MAX))
    expect(r2.map((r) => r.id)).toEqual(ids(kind, 'key-1', '1', REDMINE_MAX, REDMINE_MAX))
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: REDMINE_MAX })
    expect(requests.map((r) => [r.params['limit'], r.params['offset']])).toEqual([
      [REDMINE_MAX, 0],
      [REDMINE_MAX, REDMINE_MAX],
    ])
  })

  it('a full last page ends on total_count, without asking for an empty page', async () => {
    const L = 40
    fakeRedmine(kind, 2 * L)
    const adapter = new RedmineAdapter()
    const params = withPageSink({ page: 2, limit: L })
    const rows = await list(adapter, C1, '1', params)
    expect(rows).toHaveLength(L)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without total_count, a full page means more and a short page is the end', async () => {
    const L = 40
    fakeRedmine(kind, 2 * L + 1, [], [], false)
    const adapter = new RedmineAdapter()
    const served: string[] = []
    const reports: Array<ReturnType<typeof readUpstreamPage>> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      served.push(...(await list(adapter, C1, '1', params)).map((r) => r.id))
      reports.push(readUpstreamPage(params))
    }
    expect(served).toEqual(ids(kind, 'key-1', '1', 0, 2 * L + 1))
    expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
    for (const r of reports) expect(r?.totalCount).toBeUndefined()
  })

  it('reports the documented total_count', async () => {
    fakeRedmine(kind, 7)
    const adapter = new RedmineAdapter()
    const params = withPageSink({ page: 1, limit: 3 })
    await list(adapter, C1, '1', params)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 7, hasMore: true })
  })
})

describe('redmine listTasks keeps its project filter', () => {
  it('sends project_id on every request', async () => {
    const { requests } = fakeRedmine('issues', 5)
    const adapter = new RedmineAdapter()
    await adapter.listTasks(C1, '7', withPageSink({ page: 2, limit: 2 }))
    for (const r of requests) expect(r.params['project_id']).toBe('7')
  })
})

describe('redmine listComments pages the embedded journals locally', () => {
  it('sends no paging input and slices the full journal list', async () => {
    const { requests } = fakeRedmine('journals', 7)
    const adapter = new RedmineAdapter()
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await adapter.listComments(C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('journals', 'key-1', '1', 3, 3))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 7,
      hasMore: true,
      pagedLocally: true,
    })
    expect(requests[0]!.params['limit']).toBeUndefined()
    expect(requests[0]!.params['offset']).toBeUndefined()
  })

  it('drops journals without notes before slicing, so no page comes back short', async () => {
    fakeRedmine('journals', 7, [], [0, 1])
    const adapter = new RedmineAdapter()
    const params = withPageSink({ page: 1, limit: 3 })
    const rows = await adapter.listComments(C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('journals', 'key-1', '1', 2, 3))
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 5, hasMore: true })
  })
})
