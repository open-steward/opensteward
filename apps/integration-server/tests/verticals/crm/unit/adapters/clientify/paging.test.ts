/**
 * Clientify's list endpoints, as the first-party Postman collection behind
 * https://developer.clientify.com/ documents them:
 *
 *   GET /v1/deals/pipelines/  "List Deal Pipelines"
 *   GET /v1/deals/            "List Deals"
 *   GET /v1/tasks/            "List Tasks"
 *   GET /v1/contacts/         "List Contacts"
 *   GET /v1/companies/        "List Companies" (example under "Query Companies")
 *
 * Each answers `{ "count", "next", "previous", "results" }`; `next` links
 * carry the page number ("https://api.clientify.net/v1/wall-entries/?page=2")
 * and are null on the last page. No page-size parameter is documented ("A
 * paginated list of contacts will be returned to you, with a maximum of 100
 * contacts per page"), so the server picks the size. There is no
 * /v1/pipelines/, /v1/opportunities/, /v1/activities/ or /v1/notes/ route.
 *
 * The fake below honours only `page`, answers any other query parameter with
 * 400 and any undocumented path with Django's HTML 404.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { ClientifyAdapter } from '../../../../../../src/verticals/crm/adapters/clientify'

const CREDS: Credentials = { accessToken: 'tok-1' }
const HOST = 'https://api.clientify.net'

const COLLECTIONS = {
  '/v1/deals/pipelines/': (id: number) => ({ id, name: `Pipeline ${id}`, stages: [] }),
  '/v1/deals/': (id: number) => ({ id, name: `Deal ${id}`, status: 1 }),
  '/v1/tasks/': (id: number) => ({ id, name: `Task ${id}`, status: 1 }),
  '/v1/contacts/': (id: number) => ({ id, first_name: `Contact ${id}` }),
  '/v1/companies/': (id: number) => ({ id, name: `Company ${id}` }),
} as const
type Path = keyof typeof COLLECTIONS

let sent: Array<{ url: URL; auth: string | undefined }> = []
/** Rows per collection, by id 1..n. */
let rows: Record<Path, number> = {
  '/v1/deals/pipelines/': 0,
  '/v1/deals/': 0,
  '/v1/tasks/': 0,
  '/v1/contacts/': 0,
  '/v1/companies/': 0,
}
/** Upstream page sizes in order; the last one repeats. */
let pageSizes: number[] = [25]

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function html404(): Response {
  return new Response('<h1>Not Found</h1>', {
    status: 404,
    headers: { 'Content-Type': 'text/html' },
  })
}

/** Row offset where upstream page p (1-based) starts. */
function startOf(p: number): number {
  let off = 0
  for (let i = 1; i < p; i++) off += pageSizes[Math.min(i - 1, pageSizes.length - 1)]!
  return off
}

async function fakeClientify(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
  sent.push({ url, auth })
  if (url.origin !== HOST) return html404()
  if ((init?.method ?? 'GET') !== 'GET') return json(405, { detail: 'Method not allowed.' })
  for (const k of url.searchParams.keys())
    if (k !== 'page') return json(400, { detail: `undocumented parameter ${k}` })

  const detail = /^(\/v1\/(?:deals\/pipelines|deals|tasks)\/)(\d+)\/$/.exec(url.pathname)
  if (detail) {
    const path = detail[1] as Path
    const id = Number(detail[2])
    if (!(path in COLLECTIONS) || id < 1 || id > rows[path])
      return json(404, { detail: 'Not found.' })
    return json(200, COLLECTIONS[path](id))
  }

  const path = url.pathname as Path
  if (!(path in COLLECTIONS)) return html404()
  const page = url.searchParams.has('page') ? Number(url.searchParams.get('page')) : 1
  const lo = startOf(page)
  const size = pageSizes[Math.min(page - 1, pageSizes.length - 1)]!
  const n = rows[path]
  if (page < 1 || (page > 1 && lo >= n)) return json(404, { detail: 'Invalid page.' })
  const ids = Array.from({ length: Math.max(0, Math.min(size, n - lo)) }, (_, i) => lo + i + 1)
  return json(200, {
    count: n,
    next: lo + size < n ? `${HOST}${path}?page=${page + 1}` : null,
    previous: page > 1 ? `${HOST}${path}?page=${page - 1}` : null,
    results: ids.map((id): unknown => COLLECTIONS[path](id)),
  })
}

beforeEach(() => {
  sent = []
  rows = {
    '/v1/deals/pipelines/': 0,
    '/v1/deals/': 0,
    '/v1/tasks/': 0,
    '/v1/contacts/': 0,
    '/v1/companies/': 0,
  }
  pageSizes = [25]
  _resetCursorPager()
  vi.stubGlobal('fetch', vi.fn(fakeClientify))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new ClientifyAdapter()

type ListMethod =
  'listPipelines' | 'listDeals' | 'listActivities' | 'listContacts' | 'listCompanies'

async function callerPage(
  method: ListMethod,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const out = (await adapter[method](CREDS, params)) as Array<{ id: string }>
  return { ids: out.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

function range(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i))
}

const METHODS: Array<[ListMethod, Path]> = [
  ['listPipelines', '/v1/deals/pipelines/'],
  ['listDeals', '/v1/deals/'],
  ['listActivities', '/v1/tasks/'],
  ['listContacts', '/v1/contacts/'],
  ['listCompanies', '/v1/companies/'],
]

describe.each(METHODS)('clientify %s', (method, path) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, every id once, hasMore exact', async () => {
    rows[path] = 2 * L + 1
    pageSizes = [4]
    const p1 = await callerPage(method, 1, L)
    const p2 = await callerPage(method, 2, L)
    const p3 = await callerPage(method, 3, L)
    expect(p1).toEqual({ ids: range(1, 10), hasMore: true })
    expect(p2).toEqual({ ids: range(11, 20), hasMore: true })
    expect(p3).toEqual({ ids: ['21'], hasMore: false })
  })

  it('cuts caller pages out of uneven upstream pages', async () => {
    rows[path] = 2 * L + 1
    pageSizes = [7, 3, 9, 1, 25]
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = await callerPage(method, page, L)
      seen.push(...p.ids)
      more.push(p.hasMore)
    }
    expect(seen).toEqual(range(1, 21))
    expect(more).toEqual([true, true, false])
  })

  it('reports hasMore false when the rows end exactly on a caller page', async () => {
    rows[path] = 2 * L
    expect(await callerPage(method, 2, L)).toEqual({ ids: range(11, 20), hasMore: false })
  })

  it('serves every row when the caller limit is above the server page size', async () => {
    rows[path] = 130
    const p1 = await callerPage(method, 1, 100)
    const p2 = await callerPage(method, 2, 100)
    expect(p1).toEqual({ ids: range(1, 100), hasMore: true })
    expect(p2).toEqual({ ids: range(101, 130), hasMore: false })
  })

  it('sends only the documented `page` parameter, on the documented path, with Token auth', async () => {
    rows[path] = 60
    await callerPage(method, 2, 25)
    expect(sent.length).toBeGreaterThan(0)
    for (const s of sent) {
      expect(s.url.origin + s.url.pathname).toBe(`${HOST}${path}`)
      expect([...s.url.searchParams.keys()]).toEqual(['page'])
      expect(s.auth).toBe('Token tok-1')
    }
    expect(sent.map((s) => s.url.searchParams.get('page'))).toContain('2')
  })

  it('returns an empty last page for an empty collection', async () => {
    expect(await callerPage(method, 1, L)).toEqual({ ids: [], hasMore: false })
  })

  it('propagates an upstream error instead of reporting an empty collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(500, { detail: 'boom' })),
    )
    await expect(callerPage(method, 1, L)).rejects.toMatchObject({ statusCode: 500 })
  })
})

describe('clientify next links', () => {
  it('refuses a next link that does not move to a later page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, {
          count: 5,
          next: `${HOST}/v1/deals/`,
          previous: null,
          results: [{ id: 1, name: 'x' }],
        }),
      ),
    )
    await expect(callerPage('listDeals', 1, 5)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('refuses a next link back to the same page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, {
          count: 5,
          next: `${HOST}/v1/deals/?page=1`,
          previous: null,
          results: [{ id: 1, name: 'x' }],
        }),
      ),
    )
    await expect(callerPage('listDeals', 1, 5)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('refuses a 200 without a DRF results array instead of reading it as empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { detail: 'not a page' })),
    )
    await expect(callerPage('listDeals', 1, 5)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('no results array'),
    })
  })
})

describe('clientify pager keys', () => {
  it('keeps each collection apart: a tasks page is never cut from cached deal rows', async () => {
    rows['/v1/deals/'] = 30
    rows['/v1/tasks/'] = 30
    await callerPage('listDeals', 1, 10)
    sent = []
    const out = (await adapter.listActivities(
      CREDS,
      withPageSink({ page: 2, limit: 10 }),
    )) as Array<{
      id: string
      type?: string
    }>
    expect(out.map((a) => a.type)).toEqual(Array(10).fill('task'))
    expect(sent.map((s) => s.url.pathname)).toContain('/v1/tasks/')
  })

  it('keeps each connection apart: a second token fetches under its own credentials', async () => {
    rows['/v1/deals/'] = 30
    await callerPage('listDeals', 1, 10)
    sent = []
    const other: Credentials = { accessToken: 'tok-2' }
    const out = await adapter.listDeals(other, withPageSink({ page: 2, limit: 10 }))
    expect(out.map((d) => d.id)).toEqual(range(11, 20))
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((s) => s.auth === 'Token tok-2')).toBe(true)
  })
})

describe('clientify get methods read the documented detail routes', () => {
  it.each([
    ['getPipeline', '/v1/deals/pipelines/', 'Pipeline 3'],
    ['getDeal', '/v1/deals/', 'Deal 3'],
    ['getActivity', '/v1/tasks/', 'Task 3'],
  ] as const)('%s reads %s:id/', async (method, path, label) => {
    rows[path] = 5
    const out = (await adapter[method](CREDS, '3')) as {
      id: string
      name?: string
      title?: string
      subject?: string
    }
    expect(out.id).toBe('3')
    expect(out.name ?? out.title ?? out.subject).toBe(label)
    expect(sent.map((s) => s.url.pathname)).toEqual([`${path}3/`])
  })
})

describe('clientify notes', () => {
  it('listNotes refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(
      adapter.listNotes(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toEqual([])
  })

  it('getNote refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(adapter.getNote(CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toEqual([])
  })
})
