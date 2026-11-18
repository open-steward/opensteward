/**
 * Yandex Tracker pages its lists by `perPage` + `page`
 * (https://yandex.ru/support/tracker/en/common-format, "Paginated display of
 * results": "perPage (optional) Number of objects (issues, queues, etc.) per
 * page. Default value: 50. page (optional) Response page number. Default
 * value: 1.") and reports `X-Total-Pages` / `X-Total-Count`. Issue search
 * (POST /v3/issues/_search) takes `perPage` as a query parameter, not a body
 * field.
 *
 * Comments page by `perPage` + `id` ("Comment's id parameter value after which
 * the requested page will begin"), and "The links to the first and next pages
 * are specified in the Link response header"
 * (https://yandex.ru/support/tracker/en/concepts/issues/get-comments).
 *
 * Every list used to read its position only from `params.cursor` (and issue
 * search sent perPage in the body), so caller page 2 repeated page 1. The fake
 * honours ONLY the documented paging inputs. No maximum `perPage` is
 * documented, so there is no clamp to test and none is declared.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { YandexTrackerAdapter } from '../../../../../../src/verticals/projects/adapters/yandex-tracker/index'

vi.mock('axios')

const BASE = 'https://api.tracker.yandex.net/v3'
const C1: Credentials = { accessToken: 'tok-1' }
const C2: Credentials = { accessToken: 'tok-2' }

interface Req {
  method: 'GET' | 'POST'
  token: string
  path: string
  params: Record<string, unknown>
  body?: Record<string, unknown>
}

type Kind = 'projects' | 'queues' | 'users' | 'issues' | 'comments'

function idNum(token: string, parent: string, n: number): number {
  return (token === 'tok-2' ? 100_000 : 0) + (parent === 'P2' ? 200_000 : 0) + n + 1
}

function row(kind: Kind, token: string, parent: string, n: number): Record<string, unknown> {
  const id = idNum(token, parent, n)
  switch (kind) {
    case 'projects':
      return { id: String(id), name: `project ${id}` }
    case 'queues':
      return { id: String(id), key: `Q${id}`, name: `queue ${id}` }
    case 'users':
      return { uid: id, login: `u${id}`, display: `user ${id}` }
    case 'issues':
      return { id: String(id), key: `T-${id}`, summary: `issue ${id}` }
    case 'comments':
      return { id, text: `comment ${id}` }
  }
}

function num(raw: unknown, fallback: number, what: string): number {
  const n = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(n) || n < 1) throw new Error(`${what} ${String(raw)} invalid`)
  return n
}

/** `perPage` + `page` from the query string only, with the documented headers. */
function pageOf(all: Record<string, unknown>[], params: Record<string, unknown>) {
  const perPage = num(params['perPage'], 50, 'perPage')
  const page = num(params['page'], 1, 'page')
  return {
    data: all.slice((page - 1) * perPage, page * perPage),
    headers: {
      'x-total-pages': String(Math.ceil(all.length / perPage)),
      'x-total-count': String(all.length),
    },
  }
}

function fakeTracker(kind: Kind, total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^OAuth /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ method: 'GET', token, path, params })
      if (kind === 'comments') {
        const m = path.match(/^\/issues\/([^/]+)\/comments$/)
        if (!m) throw new Error(`unexpected path ${path}`)
        const parent = m[1]!
        const all = Array.from({ length: total }, (_, i) => row(kind, token, parent, i))
        const perPage = num(params['perPage'], 50, 'perPage')
        const after = params['id'] === undefined ? undefined : Number(params['id'])
        const start = after === undefined ? 0 : all.findIndex((r) => (r['id'] as number) > after)
        const from = start < 0 ? all.length : start
        const data = all.slice(from, from + perPage)
        const links = [`<${BASE}${path}?perPage=${perPage}>; rel="first"`]
        if (from + perPage < all.length) {
          const last = data[data.length - 1]!['id'] as number
          links.push(`<${BASE}${path}?perPage=${perPage}&id=${last}>; rel="next"`)
        }
        return { data, headers: { link: links.join(', ') } }
      }
      if (path !== `/${kind}`) throw new Error(`unexpected path ${path}`)
      const all = Array.from({ length: total }, (_, i) => row(kind, token, 'all', i))
      return pageOf(all, params)
    })
    const post = vi.fn(
      async (
        path: string,
        body: Record<string, unknown>,
        cfg?: { params?: Record<string, unknown> },
      ) => {
        const params = { ...(cfg?.params ?? {}) }
        requests.push({ method: 'POST', token, path, params, body })
        if (path !== '/issues/_search') throw new Error(`unexpected path ${path}`)
        const parent = String((body['filter'] as Record<string, unknown>)['project'])
        const all = Array.from({ length: total }, (_, i) => row('issues', token, parent, i))
        return pageOf(all, params)
      },
    )
    return { get, post }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: YandexTrackerAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const PAGE_LISTS: Array<[string, Kind, Lister]> = [
  ['listProjects', 'projects', (a, c, _p, p) => a.listProjects(c, p)],
  ['listWorkspaces', 'queues', (a, c, _p, p) => a.listWorkspaces(c, p)],
  ['listUsers', 'users', (a, c, _p, p) => a.listUsers(c, 'W', p)],
  ['listTasks', 'issues', (a, c, parent, p) => a.listTasks(c, parent, p)],
]

const ALL_LISTS: Array<[string, Kind, Lister]> = [
  ...PAGE_LISTS,
  ['listComments', 'comments', (a, c, parent, p) => a.listComments(c, parent, p)],
]

function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  const par = kind === 'issues' || kind === 'comments' ? parent : 'all'
  return Array.from({ length: n }, (_, i) => String(idNum(token, par, from + i)))
}

function adapter(): YandexTrackerAdapter {
  return new YandexTrackerAdapter({
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: 'https://example.com/cb',
    orgId: '123',
  })
}

afterEach(() => {
  vi.clearAllMocks()
  _resetCursorPager()
})

describe.each(ALL_LISTS)('yandex-tracker %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeTracker(kind, 2 * L + 1)
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(a, C1, 'P1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'P1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeTracker(kind, 230)
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(a, C1, 'P1', params), params, 'yandex-tracker')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'P1', 0, 230))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 40
    fakeTracker(kind, 2 * L + 1)
    const a = adapter()
    const a1 = await list(a, C1, 'P1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(a, C2, 'P1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(a, C1, 'P1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'P1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-2', 'P1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'P1', L, L))
  })
})

describe.each(PAGE_LISTS)('yandex-tracker %s sends the documented page', (_name, kind, list) => {
  it('page 2 is fetched with page = 2 and perPage = L in the query string', async () => {
    const L = 40
    const { requests } = fakeTracker(kind, 2 * L + 1)
    await list(adapter(), C1, 'P1', withPageSink({ page: 2, limit: L }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params).toMatchObject({ page: 2, perPage: L })
    expect(requests[0]!.params['id']).toBeUndefined()
  })

  it('reports X-Total-Count as totalCount', async () => {
    fakeTracker(kind, 7)
    const params = withPageSink({ page: 1, limit: 3 })
    await list(adapter(), C1, 'P1', params)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 7, totalPages: 3, hasMore: true })
  })
})

describe('yandex-tracker listTasks', () => {
  it('keeps the project filter in the body and paging out of it', async () => {
    const { requests } = fakeTracker('issues', 5)
    await adapter().listTasks(C1, 'P1', withPageSink({ page: 2, limit: 2 }))
    expect(requests[0]!.body).toEqual({ filter: { project: 'P1' } })
  })
})

describe('yandex-tracker listComments follows the Link header', () => {
  it('page 2 is fetched with the id named by rel="next" and perPage = L', async () => {
    const L = 40
    const { requests } = fakeTracker('comments', 2 * L + 1)
    await adapter().listComments(C1, 'P1', withPageSink({ page: 2, limit: L }))
    expect(requests.map((r) => [r.params['perPage'], r.params['id']])).toEqual([
      [L, undefined],
      [L, String(idNum('tok-1', 'P1', L - 1))],
    ])
    for (const r of requests) expect(r.params['page']).toBeUndefined()
  })

  it('two tasks interleaved each walk their own comments', async () => {
    const L = 40
    fakeTracker('comments', 2 * L + 1)
    const a = adapter()
    const a1 = await a.listComments(C1, 'P1', withPageSink({ page: 1, limit: L }))
    const b2 = await a.listComments(C1, 'P2', withPageSink({ page: 2, limit: L }))
    const a2 = await a.listComments(C1, 'P1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids('comments', 'tok-1', 'P1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids('comments', 'tok-1', 'P2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('comments', 'tok-1', 'P1', L, L))
  })

  it('an explicit cursor is sent as the id and fetched as is', async () => {
    const { requests } = fakeTracker('comments', 10)
    const params = withPageSink({ limit: 3, cursor: String(idNum('tok-1', 'P1', 2)) })
    const rows = await adapter().listComments(C1, 'P1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('comments', 'tok-1', 'P1', 3, 3))
    expect(requests).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe('yandex-tracker listComments pager is keyed by page size', () => {
  it('a walk at limit A does not lend its cursor to page 2 at limit B', async () => {
    const A = 40
    const B = 25
    fakeTracker('comments', 3 * A)
    const a = adapter()
    await a.listComments(C1, 'P1', withPageSink({ page: 1, limit: A }))
    const b2 = await a.listComments(C1, 'P1', withPageSink({ page: 2, limit: B }))
    expect(b2.map((r) => r.id)).toEqual(ids('comments', 'tok-1', 'P1', B, B))
  })
})

describe('yandex-tracker legacy numeric cursor', () => {
  it.each(PAGE_LISTS)(
    '%s reads a numeric cursor as the page when page is absent',
    async (_n, kind, list) => {
      const { requests } = fakeTracker(kind, 10)
      const rows = await list(adapter(), C1, 'P1', withPageSink({ limit: 3, cursor: '2' }))
      expect(requests[0]!.params).toMatchObject({ page: 2, perPage: 3 })
      expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'P1', 3, 3))
    },
  )
})

describe('yandex-tracker reads paging headers case-insensitively', () => {
  it('X-Total-Pages / X-Total-Count in mixed case still report the end', async () => {
    vi.mocked(axios.create).mockImplementation((() => ({
      get: vi.fn(async () => ({
        data: [{ id: '1', key: 'Q1', name: 'queue 1' }],
        headers: { 'X-Total-Pages': '2', 'X-Total-Count': '4' },
      })),
      post: vi.fn(),
    })) as unknown as typeof axios.create)
    const params = withPageSink({ page: 2, limit: 2 })
    await adapter().listWorkspaces(C1, params)
    expect(readUpstreamPage(params)).toMatchObject({ totalPages: 2, totalCount: 4, hasMore: false })
  })
})
