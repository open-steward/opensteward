/**
 * InLoox list paging: every list serves the caller's page `page` at `limit`.
 *
 * InLoox's OpenAPI (https://app.inloox.com/api/v1/openapi/v2.json, the source
 * the Scalar page at /api/v1/swagger/index.html loads) gives every collection
 * GET the shared OData parameters:
 *   $top   "Show only the first n items"
 *   $skip  "Skip the first n items"
 * and a collection response ("Collection of ApiProject", …) whose only
 * property is `value`: no next link, no count, no documented maximum `$top`.
 * So page `page` at `limit` is `$top=limit&$skip=(page-1)*limit`, and a page
 * shorter than `$top` is the end. The adapter sent `$top` alone and read the
 * offset from `params.cursor`, which the router never sets, so page 2 was
 * page 1 again.
 *
 * `/Contact` is an EntitySet in the live service's `$metadata`
 * (https://app.inloox.com/api/v1/odata/$metadata) but has no path in the
 * OpenAPI document; it takes the same OData system query options.
 *
 * The fake upstream below honours ONLY `$top`, `$skip` and the adapter's
 * `$filter`, and answers at the seam every InLoox request crosses, axios's
 * transport. Task rows carry the real key `TaskItemId`; the task transform
 * reads `TaskId` (a mapping bug outside this paging fix), so tasks are
 * followed by name.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  type PageMaxBearing,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { InlooxAdapter } from '../../../../../../src/verticals/projects/adapters/inloox/index'

const ORIGIN = 'https://app.inloox.com'
const BASE = '/api/v1/odata'
const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const FILTERS: Record<string, string | undefined> = {
  [`${BASE}/Project`]: undefined,
  [`${BASE}/Task`]: `ProjectId eq ${PROJECT_ID}`,
  [`${BASE}/Contact`]: 'IsIdentity eq true',
}

const adapter = new InlooxAdapter()
const CREDS = { accessToken: 'pat' }

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const names = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `r${String(i + 1).padStart(4, '0')}`)

function row(path: string, name: string): Record<string, unknown> {
  if (path.endsWith('/Project')) return { ProjectId: name, Name: name }
  if (path.endsWith('/Task')) return { TaskItemId: name, Name: name, ProjectId: PROJECT_ID }
  return { ContactId: name, DisplayName: name, IsIdentity: true }
}

/**
 * `cap` simulates an undocumented server-side page cap below `$top`: the page
 * comes back short and carries an `@odata.nextLink`.
 */
function fakeInloox(n: number, cap?: number): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN || !(url.pathname in FILTERS))
      throw httpError(404, { error: `no route ${url.pathname}` })
    const q = url.searchParams
    const allowed = new Set(['$top', '$skip', ...(FILTERS[url.pathname] ? ['$filter'] : [])])
    for (const k of q.keys()) if (!allowed.has(k)) throw httpError(400, { error: `unknown ${k}` })
    if (q.get('$filter') !== (FILTERS[url.pathname] ?? null))
      throw httpError(400, { error: `bad $filter ${q.get('$filter')}` })
    const all = names(n)
    const skip = Number(q.get('$skip') ?? 0)
    const asked = q.has('$top') ? Number(q.get('$top')) : all.length
    const top = cap === undefined ? asked : Math.min(asked, cap)
    const value = all.slice(skip, skip + top).map((name) => row(url.pathname, name))
    const nextLink =
      cap !== undefined && skip + top < all.length
        ? { '@odata.nextLink': `${url.href}&$skiptoken=${skip + top}` }
        : {}
    return {
      data: { '@odata.context': `${ORIGIN}${BASE}/$metadata`, value, ...nextLink },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listProjects' | 'listTasks' | 'listUsers'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listProjects':
      return (await adapter.listProjects(CREDS, params)).map((r) => r.id)
    case 'listTasks':
      return (await adapter.listTasks(CREDS, PROJECT_ID, params)).map((r) => r.title)
    case 'listUsers':
      return (await adapter.listUsers(CREDS, 'ws', params)).map((r) => r.id)
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

const METHODS: Array<[Method, string]> = [
  ['listProjects', `${BASE}/Project`],
  ['listTasks', `${BASE}/Task`],
  ['listUsers', `${BASE}/Contact`],
]

describe.each(METHODS)('inloox %s serves the caller page', (method, path) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeInloox(2 * L + 1)
    const all = names(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('sends page 2 as $top=limit&$skip=limit to the collection', async () => {
    fakeInloox(2 * L + 1)
    await syncPage(method, 2, L)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.pathname).toBe(path)
    expect(seen[0]!.searchParams.get('$top')).toBe(String(L))
    expect(seen[0]!.searchParams.get('$skip')).toBe(String(L))
  })

  it('sends page 1 with no $skip', async () => {
    fakeInloox(3)
    await syncPage(method, 1, L)
    expect(seen[0]!.searchParams.get('$top')).toBe(String(L))
    expect(seen[0]!.searchParams.has('$skip')).toBe(false)
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeInloox(1234)
    const out: string[] = []
    for (let page = 1; page < 20; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(names(1234))
  })

  it('reports more when a short page carries @odata.nextLink', async () => {
    fakeInloox(2 * L + 1, L - 3)
    expect(await syncPage(method, 1, L)).toEqual({ ids: names(L - 3), hasMore: true })
  })

  it('pages through the API path', async () => {
    fakeInloox(450)
    const params = parseListQuery({ limit: '200', page: '2' }, adapter as PageMaxBearing)
    const env = listPage(await call(method, params), params, 'inloox')
    expect(env.data).toEqual(names(450).slice(200, 400))
    expect(env.meta.limit).toBe(200)
    expect(env.meta.hasMore).toBe(true)
    expect(seen[0]!.searchParams.get('$skip')).toBe('200')
  })
})

describe('inloox declares no page maximum', () => {
  it('has none to clamp to: InLoox documents no maximum $top', () => {
    expect((adapter as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
  })
})
