/**
 * Krayin CRM list paging, against the first-party krayin/rest-api package.
 *
 * Every list is `Resource::collection($query->paginate(request()->input('limit') ?? 10))`
 * (src/Http/Controllers/V1/Controller.php allResources()), documented with the
 * query parameters `page` ("Page number") and `limit` ("Limit") on, e.g.,
 * path="/api/v1/settings/pipelines" (src/Docs/Controllers/Settings/PipelineController.php).
 * Laravel serialises that as `{ data, links, meta }`, with `meta.current_page`,
 * `meta.last_page` and `meta.total` (https://laravel.com/docs/11.x/eloquent-resources#pagination).
 *
 * The fake below honours ONLY those parameters, orders by id desc like
 * allResources() does without `sort`, and refuses any other query parameter.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { KrayinCrmAdapter } from '../../../../../../src/verticals/crm/adapters/krayin-crm/index'

const CREDS = { accessToken: 'tok', extra: { instanceUrl: 'https://crm.example.test' } }

type Call = (a: KrayinCrmAdapter, p: QueryParams) => Promise<{ id: string }[]>

function row(i: number): Record<string, unknown> {
  // A row every read transform accepts: the documented required fields.
  return { id: i, name: `n${i}`, title: `t${i}`, stages: [] }
}

const LISTS: { name: string; path: string; call: Call }[] = [
  {
    name: 'listContacts',
    path: '/api/v1/contacts/persons',
    call: (a, p) => a.listContacts(CREDS, p),
  },
  {
    name: 'listCompanies',
    path: '/api/v1/contacts/organizations',
    call: (a, p) => a.listCompanies(CREDS, p),
  },
  { name: 'listDeals', path: '/api/v1/leads', call: (a, p) => a.listDeals(CREDS, p) },
  {
    name: 'listPipelines',
    path: '/api/v1/settings/pipelines',
    call: (a, p) => a.listPipelines(CREDS, p),
  },
  {
    name: 'listActivities',
    path: '/api/v1/activities',
    call: (a, p) => a.listActivities(CREDS, p),
  },
]

function fakeKrayin(path: string, total: number, opts: { noMeta?: boolean } = {}) {
  // allResources() orders by id desc when no `sort` is given.
  const store = Array.from({ length: total }, (_, i) => row(total - i))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== path) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    for (const k of url.searchParams.keys()) {
      if (k !== 'page' && k !== 'limit') return new Response(`undocumented ${k}`, { status: 400 })
    }
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '10')
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1) {
      return new Response('bad page/limit', { status: 400 })
    }
    const lastPage = Math.max(1, Math.ceil(store.length / limit))
    const body = {
      data: store.slice((page - 1) * limit, page * limit),
      links: {},
      ...(opts.noMeta
        ? {}
        : {
            meta: { current_page: page, last_page: lastPage, per_page: limit, total: store.length },
          }),
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { store, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(LISTS)('krayin-crm $name paging', ({ path, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { store } = fakeKrayin(path, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new KrayinCrmAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(store.map((r) => String(r['id'])))
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
  })

  it('sends the caller page and limit, and nothing else, on the documented path', async () => {
    const { sent } = fakeKrayin(path, 9)
    await call(new KrayinCrmAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.origin + sent[0]!.pathname).toBe(`https://crm.example.test${path}`)
    expect(Object.fromEntries(sent[0]!.searchParams)).toEqual({ page: '2', limit: '4' })
  })

  it('ends on a full last page when the rows are an exact multiple of the limit', async () => {
    fakeKrayin(path, 8)
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new KrayinCrmAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(8)
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeKrayin(path, 25)
    const adapter = new KrayinCrmAdapter()
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await call(adapter, params), params, 'krayin-crm')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)
    const last = parseListQuery({ page: '3', limit: '10' })
    const envLast = listPage(await call(adapter, last), last, 'krayin-crm')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('claims no end when the paginator meta is absent', async () => {
    fakeKrayin(path, 25, { noMeta: true })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await call(new KrayinCrmAdapter(), params)).toHaveLength(10)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('throws when the response has no `data` array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ meta: { current_page: 1, last_page: 1, total: 0 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(
      call(new KrayinCrmAdapter(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/no "data" array/)
  })

  it('surfaces an upstream 404 instead of reporting an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }))
    await expect(
      call(new KrayinCrmAdapter(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
