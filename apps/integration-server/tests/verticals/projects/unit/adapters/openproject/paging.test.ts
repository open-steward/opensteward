/**
 * OpenProject list paging: every list serves the caller's page `page` at `limit`.
 *
 * API v3 collections (https://www.openproject.org/docs/api/collections/):
 * "offset | The page number that is requested from paginated collection",
 * "pageSize | Amount of elements that a response will hold", and "total | The
 * total amount of elements available in the collection". GET /api/v3/users and
 * GET /api/v3/projects/{id}/work_packages document `offset` ("Page number
 * inside the requested collection.") and `pageSize` ("Number of elements to
 * display per page."); GET /api/v3/projects answers a
 * ProjectCollectionModel, an OffsetPaginatedCollectionModel. The server caps
 * `pageSize` at the instance's configurable "maximum page size" (default
 * 1000) and echoes the size it used. The adapter read the page from
 * `params.cursor`, which the router never sets, so page 2 was page 1 again.
 *
 * GET /api/v3/work_packages/{id}/activities documents no query parameter at
 * all: "Some collections feature no pagination at all, meaning they will
 * always return all elements." Its comments are paged locally.
 *
 * The fake upstream below honours ONLY the documented parameters and answers
 * at the seam every OpenProject request crosses, axios's transport.
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
import { OpenprojectAdapter } from '../../../../../../src/verticals/projects/adapters/openproject/index'

const ORIGIN = 'https://op.example.test'
const PROJECT = '5'
const TASK = '77'
const PAGED_PARAMS = new Set(['offset', 'pageSize'])
const DEFAULT_MAX = 1000

const adapter = new OpenprojectAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const CREDS = { accessToken: 'tok', extra: { instanceUrl: ORIGIN } }

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const ids = (n: number, start = 1): string[] =>
  Array.from({ length: n }, (_, i) => String(start + i))

interface Fake {
  rows: number
  /** The instance's "maximum page size" setting. */
  maxPageSize?: number
  /** Non-comment activities, one after each comment up to this many. */
  otherActivities?: number
  /** Leave `total` out of paged collections, as a `select` without it would. */
  omitTotal?: boolean
}

function element(path: string, id: number): Record<string, unknown> {
  if (path.endsWith('/work_packages'))
    return { _type: 'WorkPackage', id, subject: `wp ${id}`, _links: {} }
  if (path.endsWith('/users')) return { _type: 'User', id, name: `u${id}`, _links: {} }
  return { _type: 'Project', id, name: `p ${id}`, identifier: `p${id}`, _links: {} }
}

function fakeOpenProject(fake: Fake): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN) throw httpError(404, { message: `no host ${url.origin}` })
    const q = url.searchParams
    const path = url.pathname
    let data: unknown
    if (
      path === '/api/v3/projects' ||
      path === '/api/v3/users' ||
      path === `/api/v3/projects/${PROJECT}/work_packages`
    ) {
      for (const k of q.keys()) if (!PAGED_PARAMS.has(k)) throw httpError(400, { message: k })
      const max = fake.maxPageSize ?? DEFAULT_MAX
      // Unset: the server's default; above the maximum: the maximum.
      const pageSize = Math.min(q.has('pageSize') ? Number(q.get('pageSize')) : 20, max)
      const offset = Math.max(1, Number(q.get('offset') ?? 1) || 1)
      const start = (offset - 1) * pageSize
      const all = ids(fake.rows).map(Number)
      const elements = all.slice(start, start + pageSize).map((id) => element(path, id))
      data = {
        _type: 'Collection',
        ...(fake.omitTotal ? {} : { total: all.length }),
        count: elements.length,
        pageSize,
        offset,
        _embedded: { elements },
        _links: {
          self: { href: `${path}?offset=${offset}&pageSize=${pageSize}` },
          ...(start + pageSize < all.length
            ? { nextByOffset: { href: `${path}?offset=${offset + 1}&pageSize=${pageSize}` } }
            : {}),
        },
      }
    } else if (path === `/api/v3/work_packages/${TASK}/activities`) {
      if ([...q.keys()].length > 0) throw httpError(400, { message: 'no query parameters' })
      const others = fake.otherActivities ?? 0
      const elements = ids(fake.rows).flatMap((id, i) => [
        { _type: 'Activity::Comment', id: Number(id), comment: { raw: `c${id}` }, _links: {} },
        ...(i < others
          ? [{ _type: 'Activity', id: 5000 + i, comment: { raw: '' }, details: [], _links: {} }]
          : []),
      ])
      data = {
        _type: 'Collection',
        total: elements.length,
        count: elements.length,
        _embedded: { elements },
        _links: {},
      }
    } else {
      throw httpError(404, { message: `no route ${path}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listProjects' | 'listTasks' | 'listUsers' | 'listComments'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listProjects':
      return (await adapter.listProjects(CREDS, params)).map((r) => r.id)
    case 'listTasks':
      return (await adapter.listTasks(CREDS, PROJECT, params)).map((r) => r.id)
    case 'listUsers':
      return (await adapter.listUsers(CREDS, 'ignored', params)).map((r) => r.id)
    case 'listComments':
      return (await adapter.listComments(CREDS, TASK, params)).map((r) => r.id)
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

const METHODS: Method[] = ['listProjects', 'listTasks', 'listUsers', 'listComments']
const PAGED: Method[] = ['listProjects', 'listTasks', 'listUsers']

describe.each(METHODS)('openproject %s serves the caller page', (method) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeOpenProject({ rows: 2 * L + 1, otherActivities: 2 * L + 1 })
    const all = ids(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeOpenProject({ rows: 2 * L })
    expect(await syncPage(method, 2, L)).toEqual({ ids: ids(2 * L).slice(L), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeOpenProject({ rows: 1234 })
    const out: string[] = []
    for (let page = 1; page < 20; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(ids(1234))
  })

  it("pages through the API path at the router's ceiling", async () => {
    fakeOpenProject({ rows: 2500 })
    const params = parseListQuery({ limit: '5000', page: '2' }, adapter)
    const env = listPage(await call(method, params), params, 'openproject')
    // The router caps limit at min(500, maxPageSize).
    expect(env.data).toEqual(ids(2500).slice(500, 1000))
    expect(env.meta.limit).toBe(500)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe.each(PAGED)('openproject %s sends the documented offset and pageSize', (method) => {
  it('asks for page 2 by offset=2 at the caller size', async () => {
    fakeOpenProject({ rows: 30 })
    await syncPage(method, 2, 10)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.searchParams.get('offset')).toBe('2')
    expect(seen[0]!.searchParams.get('pageSize')).toBe('10')
  })

  it('clamps a limit above the maximum page size', async () => {
    fakeOpenProject({ rows: 1500 })
    const params = withPageSink({ page: 1, limit: 5000 })
    const got = await call(method, params)
    expect(seen[0]!.searchParams.get('pageSize')).toBe(String(DEFAULT_MAX))
    expect(got).toEqual(ids(DEFAULT_MAX))
    expect(readUpstreamPage(params)).toMatchObject({
      hasMore: true,
      totalCount: 1500,
      pageSize: DEFAULT_MAX,
    })
  })

  it('falls back to the nextByOffset link for hasMore when total is absent', async () => {
    fakeOpenProject({ rows: 25, omitTotal: true })
    expect(await syncPage(method, 1, 10)).toEqual({ ids: ids(25).slice(0, 10), hasMore: true })
    expect(await syncPage(method, 3, 10)).toEqual({ ids: ids(25).slice(20), hasMore: false })
  })

  it('pages at the size an instance with a smaller maximum answers with', async () => {
    fakeOpenProject({ rows: 250, maxPageSize: 100 })
    const out: string[] = []
    for (let page = 1; page < 10; page++) {
      const params = withPageSink({ page, limit: 500 })
      const got = await call(method, params)
      const meta = readUpstreamPage(params)
      expect(meta?.pageSize).toBe(100)
      out.push(...got)
      if (meta?.hasMore === false) break
    }
    expect(out).toEqual(ids(250))
  })
})

describe('openproject listComments', () => {
  it('sends no paging parameters to the unpaginated activities endpoint', async () => {
    fakeOpenProject({ rows: 3 })
    await syncPage('listComments', 2, 1)
    expect([...seen[0]!.searchParams.keys()]).toEqual([])
  })

  it('pages the comments, not the activities they are filtered from', async () => {
    fakeOpenProject({ rows: 12, otherActivities: 12 })
    const params = withPageSink({ page: 2, limit: 5 })
    expect(await call('listComments', params)).toEqual(ids(12).slice(5, 10))
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 12, hasMore: true })
  })
})
