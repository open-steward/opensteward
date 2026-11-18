/**
 * Vikunja list paging: every list serves the caller's page `page` at `limit`.
 *
 * Vikunja's API spec (https://try.vikunja.io/api/v1/docs.json) documents, for
 * GET /projects and GET /labels:
 *   page      "The page number. Used for pagination. If not provided, the first
 *             page of results is returned."
 *   per_page  "The maximum number of items per page. Note this parameter is
 *             limited by the configured maximum of items per page."
 * and in its description: "Every endpoint capable of pagination will return two
 * headers: `x-pagination-total-pages`: The total number of available pages for
 * this request". The configured maximum is `service.maxitemsperpage`, 50 by
 * default and set per instance, and a larger per_page is silently clamped to
 * it (pkg/web/handler/read_all.go), so the adapter walks upstream pages by the
 * total-pages header rather than trusting per_page.
 *
 * GET /tasks/{taskID}/comments is served by the same generic ReadAllWeb
 * handler (pkg/routes/routes.go), which reads `page` and `per_page` for every
 * route it serves, so it pages the same way although the spec lists neither.
 *
 * GET /projects/{id}/projectusers ("Lists all users") takes only `s` and
 * returns every matching user: paged locally.
 *
 * GET /projects/{id}/tasks is documented only as PUT ("Create a task"), so
 * listTasks reads GET /tasks ("Returns all tasks on any project the user has
 * access to.", with page, per_page, s, sort_by, order_by, filter,
 * filter_timezone, filter_include_nulls and expand) narrowed by the filter the
 * Filter API Reference (https://vikunja.io/docs/filters) documents:
 * "Through the API, you must use numeric IDs: ... project = 12". The fake
 * answers every project's tasks, interleaved, unless that filter narrows them.
 *
 * The fake upstream below honours ONLY the documented parameters and answers
 * at the seam every Vikunja request crosses, axios's transport.
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
import type { ProjectsAdapter } from '../../../../../../src/verticals/projects/adapter/interface'
import { VikunjaAdapter } from '../../../../../../src/verticals/projects/adapters/vikunja/index'

const ORIGIN = 'https://try.vikunja.io'
/** A second, self-hosted instance; its rows are numbered from OTHER_OFFSET + 1. */
const OTHER_ORIGIN = 'https://vikunja.example.org'
const OTHER_OFFSET = 5000
const PROJECT_ID = '9'
/** A second project, whose tasks are numbered from OTHER_OFFSET + 1. */
const OTHER_PROJECT_ID = '10'
const TASK_ID = '77'
/** A second task, whose comments are numbered from OTHER_OFFSET + 1. */
const OTHER_TASK_ID = '78'
const COMMENT_PARAMS = new Set(['page', 'per_page', 's', 'order_by'])
const PAGED_PARAMS: Record<string, Set<string>> = {
  '/api/v1/projects': new Set(['page', 'per_page', 's', 'is_archived', 'expand']),
  '/api/v1/labels': new Set(['page', 'per_page', 's']),
  [`/api/v1/tasks/${TASK_ID}/comments`]: COMMENT_PARAMS,
  [`/api/v1/tasks/${OTHER_TASK_ID}/comments`]: COMMENT_PARAMS,
  '/api/v1/tasks': new Set([
    'page',
    'per_page',
    's',
    'sort_by',
    'order_by',
    'filter',
    'filter_timezone',
    'filter_include_nulls',
    'expand',
  ]),
}

/**
 * Every task on the instance: project PROJECT_ID's tasks 1..n, each followed by
 * one of OTHER_PROJECT_ID's (OTHER_OFFSET + 1..n), narrowed only by the
 * documented `project = <id>` filter.
 */
function taskRows(n: number, filter: string | null): Array<Record<string, unknown>> {
  const all: Array<Record<string, unknown>> = []
  for (const id of ids(n)) {
    all.push({ id: Number(id), title: `t${id}`, project_id: Number(PROJECT_ID) })
    const other = OTHER_OFFSET + Number(id)
    all.push({ id: other, title: `t${other}`, project_id: Number(OTHER_PROJECT_ID) })
  }
  if (filter === null) return all
  const m = /^project = (\d+)$/.exec(filter)
  if (!m) throw httpError(400, { message: `unsupported filter ${filter}` })
  return all.filter((t) => t.project_id === Number(m[1]))
}
const USERS_PATH = `/api/v1/projects/${PROJECT_ID}/projectusers`

// The router holds it as a ProjectsAdapter (parseListQuery reads its capabilities).
const adapter = new VikunjaAdapter()

interface Counts {
  projects?: number
  /** Child projects (parent_project_id set), one after each of the first `children` roots. */
  children?: number
  labels?: number
  comments?: number
  tasks?: number
  users?: number
  /** The instance's `service.maxitemsperpage`. Default 50. */
  maxItemsPerPage?: number
  /** Leave out the pagination headers. */
  noHeaders?: boolean
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const ids = (n: number, start = 1): string[] =>
  Array.from({ length: n }, (_, i) => String(start + i))

function projectRows(c: Counts): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const [i, id] of ids(c.projects ?? 0).entries()) {
    out.push({ id: Number(id), title: `p${id}`, parent_project_id: 0 })
    if (i < (c.children ?? 0))
      out.push({ id: 1000 + i, title: `child ${i}`, parent_project_id: Number(id) })
  }
  return out
}

function fakeVikunja(c: Counts): void {
  seen = []
  const max = c.maxItemsPerPage ?? 50
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN && url.origin !== OTHER_ORIGIN)
      throw httpError(404, { message: `no host ${url.origin}` })
    const instanceOffset = url.origin === OTHER_ORIGIN ? OTHER_OFFSET : 0
    const q = url.searchParams
    const allowed = PAGED_PARAMS[url.pathname]
    let data: unknown
    const headers: Record<string, string> = {}
    if (allowed) {
      for (const k of q.keys())
        if (!allowed.has(k)) throw httpError(400, { message: `unknown ${k}` })
      const all =
        url.pathname === '/api/v1/projects'
          ? projectRows(c)
          : url.pathname === '/api/v1/labels'
            ? ids(c.labels ?? 0, 1 + instanceOffset).map((id) => ({
                id: Number(id),
                title: `l${id}`,
              }))
            : url.pathname === '/api/v1/tasks'
              ? taskRows(c.tasks ?? 0, q.get('filter'))
              : ids(
                  c.comments ?? 0,
                  url.pathname.includes(`/tasks/${OTHER_TASK_ID}/`) ? OTHER_OFFSET + 1 : 1,
                ).map((id) => ({ id: Number(id), comment: `c${id}` }))
      // pkg/web/handler/read_all.go: absent/0 per_page is the maximum, and a
      // larger one is clamped to it.
      let perPage = Number(q.get('per_page') ?? 0)
      if (perPage === 0 || perPage > max) perPage = max
      const page = Number(q.get('page') ?? 1)
      const start = (page - 1) * perPage
      const rows = all.slice(start, start + perPage)
      data = rows
      if (!c.noHeaders) {
        headers['x-pagination-total-pages'] =
          rows.length === 0 ? '0' : String(Math.ceil(all.length / perPage))
        headers['x-pagination-result-count'] = String(rows.length)
      }
    } else if (url.pathname === USERS_PATH) {
      for (const k of q.keys()) if (k !== 's') throw httpError(400, { message: `unknown ${k}` })
      data = ids(c.users ?? 0).map((id) => ({
        id: Number(id),
        username: `u${id}`,
        name: `U ${id}`,
      }))
    } else {
      throw httpError(404, { message: `no route ${url.pathname}` })
    }
    return { data, status: 200, statusText: 'OK', headers, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method =
  'listProjects' | 'listTags' | 'listComments' | 'listWorkspaces' | 'listUsers' | 'listTasks'

// A distinct token per test keeps the row pager's per-connection memo from
// carrying rows from one test's fake into the next.
let tokenSeq = 0
let creds = { accessToken: 'tk_0' }
function freshCreds(): void {
  creds = { accessToken: `tk_${++tokenSeq}` }
}

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listProjects':
      return (await adapter.listProjects(creds, params)).map((r) => r.id)
    case 'listTags':
      return (await adapter.listTags(creds, 'ignored', params)).map((r) => r.id)
    case 'listComments':
      return (await adapter.listComments(creds, TASK_ID, params)).map((r) => r.id)
    case 'listWorkspaces':
      return (await adapter.listWorkspaces(creds, params)).map((r) => r.id)
    case 'listUsers':
      return (await adapter.listUsers(creds, PROJECT_ID, params)).map((r) => r.id)
    case 'listTasks':
      return (await adapter.listTasks(creds, PROJECT_ID, params)).map((r) => r.id)
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

/** Workspaces are the root projects; interleaved children must not shorten a page. */
const METHODS: Array<[Method, (n: number) => Counts]> = [
  ['listProjects', (n) => ({ projects: n })],
  ['listTags', (n) => ({ labels: n })],
  ['listComments', (n) => ({ comments: n })],
  ['listWorkspaces', (n) => ({ projects: n, children: n })],
  ['listUsers', (n) => ({ users: n })],
  ['listTasks', (n) => ({ tasks: n })],
]

describe.each(METHODS)('vikunja %s serves the caller page', (method, counts) => {
  it.each([10, 50])(
    'serves 2L+1 rows over pages 1, 2, 3 each once, in order, hasMore exact (L=%i)',
    async (L) => {
      freshCreds()
      fakeVikunja(counts(2 * L + 1))
      const all = ids(2 * L + 1)
      expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
      expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
      expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
    },
  )

  it('reports hasMore false when the rows end exactly on a page', async () => {
    freshCreds()
    fakeVikunja(counts(20))
    expect(await syncPage(method, 2, 10)).toEqual({ ids: ids(20).slice(10), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    freshCreds()
    fakeVikunja(counts(1234))
    const out: string[] = []
    for (let page = 1; page < 10; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(ids(1234))
  })

  it('pages through the API path', async () => {
    freshCreds()
    fakeVikunja(counts(250))
    const params = parseListQuery({ limit: '100', page: '2' }, adapter as ProjectsAdapter)
    const env = listPage(await call(method, params), params, 'vikunja')
    expect(env.data).toEqual(ids(250).slice(100, 200))
    expect(env.meta.hasMore).toBe(true)
  })

  it('reports that it paged locally', async () => {
    freshCreds()
    fakeVikunja(counts(5))
    const params = withPageSink({ page: 1, limit: 2 })
    await call(method, params)
    expect(readUpstreamPage(params)).toMatchObject({ pagedLocally: true, hasMore: true })
  })
})

const PAGED: Array<[Method, (n: number) => Counts, string]> = [
  ['listProjects', (n) => ({ projects: n }), '/api/v1/projects'],
  ['listTags', (n) => ({ labels: n }), '/api/v1/labels'],
  ['listComments', (n) => ({ comments: n }), `/api/v1/tasks/${TASK_ID}/comments`],
  ['listWorkspaces', (n) => ({ projects: n }), '/api/v1/projects'],
  ['listTasks', (n) => ({ tasks: n }), '/api/v1/tasks'],
]

describe.each(PAGED)('vikunja %s walks page + per_page', (method, counts, path) => {
  it('sends the documented page on the request for the second upstream page', async () => {
    freshCreds()
    fakeVikunja(counts(101))
    await syncPage(method, 2, 50)
    const pages = seen.filter((u) => u.pathname === path).map((u) => u.searchParams.get('page'))
    expect(pages).toContain('2')
    for (const u of seen) expect(Number(u.searchParams.get('per_page'))).toBeLessThanOrEqual(50)
  })

  it('never asks for more than 50 a page, and a limit above it is served exactly', async () => {
    freshCreds()
    fakeVikunja(counts(260))
    expect(await syncPage(method, 2, 120)).toEqual({ ids: ids(260).slice(120, 240), hasMore: true })
    expect(await syncPage(method, 3, 120)).toEqual({ ids: ids(260).slice(240), hasMore: false })
    for (const u of seen) expect(u.searchParams.get('per_page')).toBe('50')
  })

  it('follows the total-pages header on an instance whose maximum is below 50', async () => {
    freshCreds()
    fakeVikunja({ ...counts(45), maxItemsPerPage: 20 })
    expect(await syncPage(method, 1, 30)).toEqual({ ids: ids(45).slice(0, 30), hasMore: true })
    expect(await syncPage(method, 2, 30)).toEqual({ ids: ids(45).slice(30), hasMore: false })
  })

  it('stops on a short page when the headers are missing', async () => {
    freshCreds()
    fakeVikunja({ ...counts(75), noHeaders: true })
    expect(await syncPage(method, 1, 60)).toEqual({ ids: ids(75).slice(0, 60), hasMore: true })
    expect(await syncPage(method, 2, 60)).toEqual({ ids: ids(75).slice(60), hasMore: false })
  })
})

describe('vikunja listTasks reads the documented GET /tasks', () => {
  it('asks GET /tasks for one project by the documented filter, sorted by id', async () => {
    freshCreds()
    fakeVikunja({ tasks: 3 })
    expect(await call('listTasks', withPageSink({ page: 1, limit: 10 }))).toEqual(ids(3))
    expect(seen.map((u) => u.pathname)).toEqual(['/api/v1/tasks'])
    const q = seen[0]!.searchParams
    expect(q.get('filter')).toBe(`project = ${PROJECT_ID}`)
    expect(q.get('sort_by')).toBe('id')
    expect(q.get('order_by')).toBe('asc')
  })

  it('keeps the tasks of two projects apart', async () => {
    freshCreds()
    fakeVikunja({ tasks: 30 })
    expect((await syncPage('listTasks', 1, 10)).ids).toEqual(ids(10))
    const other = await adapter.listTasks(
      creds,
      OTHER_PROJECT_ID,
      withPageSink({ page: 2, limit: 10 }),
    )
    expect(other.map((r) => r.id)).toEqual(ids(10, OTHER_OFFSET + 11))
    expect(other.every((t) => t.projectId === OTHER_PROJECT_ID)).toBe(true)
  })

  it("labels each task with its documented project_id, not the caller's id", async () => {
    freshCreds()
    fakeVikunja({ tasks: 3 })
    // `project = 0<id>` still matches the same project upstream, but the
    // caller's spelling of the id must not become the row's projectId.
    const rows = await adapter.listTasks(
      creds,
      `0${PROJECT_ID}`,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(rows.map((r) => r.id)).toEqual(ids(3))
    expect(rows.every((t) => t.projectId === String(Number(PROJECT_ID)))).toBe(true)
  })
})

describe('vikunja listUsers is paged locally', () => {
  it('reports the whole collection as the total', async () => {
    freshCreds()
    fakeVikunja({ users: 5 })
    const params = withPageSink({ page: 2, limit: 2 })
    expect(await call('listUsers', params)).toEqual(['3', '4'])
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 5,
      hasMore: true,
    })
  })
})

describe('vikunja row walks stay apart on one connection', () => {
  it('keeps listProjects and listWorkspaces apart although both read /projects', async () => {
    freshCreds()
    fakeVikunja({ projects: 30, children: 30 })
    const projectIds = projectRows({ projects: 30, children: 30 }).map((p) => String(p.id))
    expect((await syncPage('listProjects', 1, 10)).ids).toEqual(projectIds.slice(0, 10))
    expect((await syncPage('listWorkspaces', 2, 10)).ids).toEqual(ids(30).slice(10, 20))
    expect((await syncPage('listProjects', 2, 10)).ids).toEqual(projectIds.slice(10, 20))
  })

  it('keeps the comments of two tasks apart', async () => {
    freshCreds()
    fakeVikunja({ comments: 30 })
    expect((await syncPage('listComments', 1, 10)).ids).toEqual(ids(10))
    const other = await adapter.listComments(
      creds,
      OTHER_TASK_ID,
      withPageSink({ page: 2, limit: 10 }),
    )
    expect(other.map((r) => r.id)).toEqual(ids(10, OTHER_OFFSET + 11))
  })

  it('keeps two instances apart when they share a token string', async () => {
    fakeVikunja({ labels: 30 })
    const token = `tk_shared_${++tokenSeq}`
    const hosted = { accessToken: token }
    const selfHosted = { accessToken: token, extra: { baseUrl: `${OTHER_ORIGIN}/api/v1` } }
    const first = await adapter.listTags(hosted, 'ignored', withPageSink({ page: 1, limit: 10 }))
    expect(first.map((r) => r.id)).toEqual(ids(10))
    const second = await adapter.listTags(
      selfHosted,
      'ignored',
      withPageSink({ page: 2, limit: 10 }),
    )
    expect(second.map((r) => r.id)).toEqual(ids(10, OTHER_OFFSET + 11))
  })
})

describe('vikunja stops at the last page the header names', () => {
  it('asks for no page past x-pagination-total-pages', async () => {
    freshCreds()
    fakeVikunja({ labels: 100 })
    expect(await syncPage('listTags', 1, 50)).toEqual({ ids: ids(50), hasMore: true })
    expect(await syncPage('listTags', 2, 50)).toEqual({ ids: ids(50, 51), hasMore: false })
    expect(seen.map((u) => u.searchParams.get('page'))).toEqual(['1', '2'])
  })
})
