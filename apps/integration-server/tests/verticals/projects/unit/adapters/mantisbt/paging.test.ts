/**
 * MantisBT list paging: every list serves the caller's page `page` at `limit`.
 *
 * GET /api/rest/issues (rest_issue_get in
 * https://raw.githubusercontent.com/mantisbt/mantisbt/master/api/rest/restcore/issues_rest.php)
 * reads `$p_request->getParam( 'page', 1 )` and
 * `$p_request->getParam( 'page_size', 50 )`, and answers `{ issues: [...] }`
 * with no count and no next link. A page past the last is empty
 * (mc_filter_get_issues: "the page number was moved back, so we have exceeded
 * the actual page number"). No maximum page size is documented, so none is
 * declared or clamped. The adapter read the page from `params.cursor`, which
 * the router never sets, so page 2 was page 1 again.
 *
 * GET /api/rest/projects returns every accessible project in one response,
 * GET /api/rest/users/me the one current user, and tags are gathered from
 * every page of the project's issues: each is the whole collection, paged
 * locally.
 *
 * The fake below honours ONLY those parameters and answers at the seam every
 * MantisBT request crosses, axios's transport.
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
import { MantisbtAdapter } from '../../../../../../src/verticals/projects/adapters/mantisbt/index'

const HOST = 'https://mantis.example.test'
const ISSUES = '/api/rest/issues'
const PROJECTS = '/api/rest/projects'
const ME = '/api/rest/users/me'
const PROJECT_ID = '3'
/** A second project on the same connection; its issue ids start at 1001. */
const OTHER_PROJECT_ID = '5'
const ISSUE_PARAMS = new Set(['project_id', 'page', 'page_size', 'filter_id', 'select'])

const adapter = new MantisbtAdapter()
const CREDS = { accessToken: 'mantis_token', extra: { host: HOST } }

interface Counts {
  issues?: number
  otherIssues?: number
  projects?: number
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const ids = (n: number, start = 1): string[] =>
  Array.from({ length: n }, (_, i) => String(start + i))

function fakeMantis(counts: Counts): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== HOST) throw httpError(404, { message: `no host ${url.origin}` })
    const q = url.searchParams
    let data: unknown
    if (url.pathname === ISSUES) {
      for (const k of q.keys())
        if (!ISSUE_PARAMS.has(k)) throw httpError(400, { message: `unknown ${k}` })
      const other = q.get('project_id') === OTHER_PROJECT_ID
      const n = (other ? counts.otherIssues : counts.issues) ?? 0
      const first = other ? 1001 : 1
      const size = Number(q.get('page_size') ?? 50)
      const page = Math.max(1, Number(q.get('page') ?? 1) || 1)
      const start = (page - 1) * size
      // Issue i carries tag i, and tag 1 again, so tags need de-duplicating.
      data = {
        issues: ids(Math.max(0, Math.min(size, n - start)), first + start).map((id) => ({
          id: Number(id),
          summary: `issue ${id}`,
          project: { id: Number(PROJECT_ID) },
          tags: [
            { id: Number(id), name: `t${id}` },
            { id: 1, name: 't1' },
          ],
        })),
      }
    } else if (url.pathname === PROJECTS) {
      if ([...q.keys()].length > 0) throw httpError(400, { message: 'takes no query parameters' })
      data = {
        projects: ids(counts.projects ?? 0).map((id) => ({ id: Number(id), name: `p${id}` })),
      }
    } else if (url.pathname === ME) {
      data = { id: 7, name: 'me', email: 'me@x.test' }
    } else {
      throw httpError(404, { message: `no route ${url.pathname}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

beforeEach(() => {
  _resetRowPager()
})

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listTasks' | 'listProjects' | 'listTags'

async function call(method: Method | 'listUsers', params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listTasks':
      return (await adapter.listTasks(CREDS, PROJECT_ID, params)).map((r) => r.id)
    case 'listProjects':
      return (await adapter.listProjects(CREDS, params)).map((r) => r.id)
    case 'listTags':
      return (await adapter.listTags(CREDS, PROJECT_ID, params)).map((r) => r.id)
    case 'listUsers':
      return (await adapter.listUsers(CREDS, PROJECT_ID, params)).map((r) => r.id)
  }
}

async function syncPage(
  method: Method | 'listUsers',
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page, limit })
  const got = await call(method, params)
  return { ids: got, hasMore: readUpstreamPage(params)?.hasMore }
}

const METHODS: Array<[Method, (n: number) => Counts]> = [
  ['listTasks', (n) => ({ issues: n })],
  ['listProjects', (n) => ({ projects: n })],
  ['listTags', (n) => ({ issues: n })],
]

describe.each(METHODS)('mantisbt %s serves the caller page', (method, counts) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeMantis(counts(2 * L + 1))
    const all = ids(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeMantis(counts(2 * L))
    const all = ids(2 * L)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeMantis(counts(1234))
    const out: string[] = []
    for (let page = 1; page < 50; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(ids(1234))
  })

  it('pages through the API path', async () => {
    fakeMantis(counts(45))
    // No page maximum is declared, so the router passes the caller's limit through.
    const params = parseListQuery({ limit: '20', page: '2' })
    const env = listPage(await call(method, params), params, 'mantisbt')
    expect(env.data).toEqual(ids(45).slice(20, 40))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('mantisbt listTasks pages by page + page_size', () => {
  it('declares no page maximum: MantisBT documents none', () => {
    expect((adapter as { capabilities?: unknown }).capabilities).toBeUndefined()
  })

  it('sends the documented page and page_size on page 2', async () => {
    fakeMantis({ issues: 21 })
    // A cold jump walks upstream pages 1 and 2 (and peeks at 3 for hasMore).
    expect((await syncPage('listTasks', 2, 10)).ids).toEqual(ids(20).slice(10))
    const urls = seen.map((u) => u.searchParams)
    expect(urls.some((q) => q.get('page') === '2' && q.get('page_size') === '10')).toBe(true)
    expect(urls.every((q) => q.get('project_id') === PROJECT_ID)).toBe(true)
  })

  it('costs one request per page on a sequential walk', async () => {
    fakeMantis({ issues: 31 })
    for (let page = 1; page <= 4; page++) await syncPage('listTasks', page, 10)
    expect(seen.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3', '4'])
  })

  it('serves a page jumped to directly', async () => {
    fakeMantis({ issues: 25 })
    expect(await syncPage('listTasks', 3, 10)).toEqual({ ids: ids(25).slice(20), hasMore: false })
  })
})

describe('mantisbt listTasks keys its row pager per project and page size', () => {
  it('serves the right rows when one connection reads at two limits', async () => {
    fakeMantis({ issues: 60 })
    // A walk at limit 10 leaves upstream positions measured in 10-row pages.
    for (let page = 1; page <= 3; page++) await syncPage('listTasks', page, 10)
    // No reset: a limit-20 read must not reuse those positions at page_size 20.
    expect(await syncPage('listTasks', 2, 20)).toEqual({
      ids: ids(60).slice(20, 40),
      hasMore: true,
    })
  })

  it("never serves one project's rows for another on the same connection", async () => {
    fakeMantis({ issues: 30, otherIssues: 30 })
    // Page 2 ends full, so the pager peeks at project 3's page 3 and holds it.
    await syncPage('listTasks', 1, 10)
    await syncPage('listTasks', 2, 10)
    const params = withPageSink({ page: 3, limit: 10 })
    const got = (await adapter.listTasks(CREDS, OTHER_PROJECT_ID, params)).map((r) => r.id)
    expect(got).toEqual(ids(10, 1021))
  })
})

describe('mantisbt listTasks without a caller limit', () => {
  it('serves 50-row pages, the documented page_size default', async () => {
    fakeMantis({ issues: 120 })
    const params = withPageSink({ page: 1 })
    expect(await call('listTasks', params)).toEqual(ids(50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(seen.every((u) => u.searchParams.get('page_size') === '50')).toBe(true)
  })
})

describe('mantisbt listTags gathers tags from every page of issues', () => {
  it('fails loudly rather than return a partial tag set past the scan guard', async () => {
    // 200 full pages of 50 and one issue more: the guard stops before the end.
    fakeMantis({ issues: 200 * 50 + 1 })
    await expect(call('listTags', withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(
      /more than 10000 issues/,
    )
    expect(seen).toHaveLength(200)
  })

  it('reads past the first page of issues', async () => {
    fakeMantis({ issues: 120 })
    const got = await syncPage('listTags', 3, 50)
    expect(got).toEqual({ ids: ids(120).slice(100), hasMore: false })
    expect(seen.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3'])
  })
})

describe('mantisbt listUsers serves its one user once', () => {
  it('pages the single current user locally', async () => {
    fakeMantis({})
    expect(await syncPage('listUsers', 1, 10)).toEqual({ ids: ['7'], hasMore: false })
    expect(await syncPage('listUsers', 2, 10)).toEqual({ ids: [], hasMore: false })
  })
})
