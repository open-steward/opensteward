/**
 * Gophr listOrders / getOrder against the V2 Commercial API.
 *
 * The adapter used to call GET https://api.gophr.com/v2/jobs?api_key=... and
 * read `raw.jobs`. First-party docs:
 *
 *   https://developers.gophr.com/reference/get-job.md (List Jobs):
 *     servers: { "url": "https://api.gophr.com/v2-commercial-api", "description": "Production" }
 *     "/jobs" get, query params `include-finished` ("If set to 1 then finished
 *     jobs will also be included in the response. Only unfinished jobs will be
 *     returned by default."), `page` ("Page number of the required results.",
 *     default 1) and `count` ("Number of items to be returned in the current
 *     page.", default 15); response `data.jobs`, `links.next` ("URL of the next
 *     page of results. `null` if on the last page.") and `meta.page.total`.
 *     securitySchemes: { "name": "API-KEY", "type": "apiKey", "in": "header" }
 *   https://developers.gophr.com/reference/get-jobs-job_id.md (Get a Job):
 *     "/jobs/{job_id}" get, response `data` = the job.
 *   https://developers.gophr.com/docs/authorisation.md:
 *     "You need to include the key in a the `API-KEY` header for all requests."
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { GophrAdapter } from '../../../../../../src/verticals/logistics/adapters/gophr/index'

const KEY = 'sand-2a7df6bd-8ed3-48ad-b801-05093a866e66'
const CREDS = { accessToken: KEY }
const BASE = 'https://api.gophr.com/v2-commercial-api/'
const ALLOWED = new Set(['include-finished', 'page', 'count'])
const DEFAULT_COUNT = 15
const L = 5
const N = 2 * L + 1

function job(i: number) {
  return {
    job_id: `job-${i}`,
    is_confirmed: 1,
    price_gross: { amount: 10 + i, currency: 'GBP' },
    deliveries: [{ delivery_id: `del-${i}`, status: 'EN_ROUTE' }],
  }
}

/**
 * A fake Gophr that serves N jobs and honours ONLY the documented params of
 * GET /jobs, and serves finished
 * jobs (every third) only when include-finished=1.
 */
function fakeGophr(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ ...job(i + 1), finished: i % 3 === 0 }))
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const q = Object.fromEntries(
      Object.entries(config?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    const bad = Object.keys(q).filter((k) => !ALLOWED.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    if (path === 'jobs') {
      const page = q.page === undefined ? 1 : Number(q.page)
      const count = q.count === undefined ? DEFAULT_COUNT : Number(q.count)
      if (!(Number.isInteger(page) && page >= 1)) throw new Error(`400: page ${page}`)
      if (!(Number.isInteger(count) && count >= 1)) throw new Error(`400: count ${count}`)
      const visible = rows
        .filter((r) => String(q['include-finished']) === '1' || !r.finished)
        .map(({ finished: _f, ...r }) => r)
      const start = (page - 1) * count
      const last = start + count >= visible.length
      return {
        data: {
          data: { jobs: visible.slice(start, start + count) },
          links: {
            first: `${BASE}jobs?page=1&count=${count}`,
            previous: page > 1 ? `${BASE}jobs?page=${page - 1}&count=${count}` : null,
            next: last ? null : `${BASE}jobs?page=${page + 1}&count=${count}`,
          },
          meta: {
            page: {
              current_page: page,
              count: Math.min(count, Math.max(0, visible.length - start)),
              total: visible.length,
            },
          },
        },
      }
    }
    const m = /^jobs\/([^/]+)$/.exec(path)
    if (m) {
      const hit = rows.find((r) => r.job_id === decodeURIComponent(m[1]))
      if (!hit) throw new Error('404')
      const { finished: _f, ...r } = hit
      return { data: { data: r } }
    }
    throw new Error(`404: ${path}`)
  })
  const post = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { get, post, create, ids: rows.map((r) => r.job_id) }
}

afterEach(() => vi.restoreAllMocks())

describe('gophr client', () => {
  it('targets the documented production base and sends the key in the API-KEY header', async () => {
    const { create, get } = fakeGophr(1)
    await new GophrAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: L }))
    const cfg = create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe(BASE)
    expect(cfg.headers['API-KEY']).toBe(KEY)
    const sent = (get.mock.calls[0] as unknown as [string, { params: Record<string, unknown> }])[1]
    expect(sent.params).not.toHaveProperty('api_key')
  })
})

describe('gophr listOrders paging', () => {
  it('serves every job once, in order, across pages 1..3 with exact hasMore', async () => {
    const { ids } = fakeGophr(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    const totals: Array<number | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new GophrAdapter().listOrders(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
      totals.push(readUpstreamPage(params)?.totalCount)
    }
    expect(seen).toEqual(ids)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
  })

  it('the page-2 request carries the documented page, count and include-finished', async () => {
    const { get } = fakeGophr(N)
    await new GophrAdapter().listOrders(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    const [path, cfg] = get.mock.calls[0] as unknown as [
      string,
      { params: Record<string, unknown> },
    ]
    expect(path).toBe('jobs')
    expect(cfg.params).toEqual({ 'include-finished': 1, page: 2, count: L })
  })

  it('includes finished jobs, so a delivered job does not drop out of the collection', async () => {
    const { ids } = fakeGophr(3)
    const rows = await new GophrAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('a call with no page or limit sends page 1 and the documented default count 15', async () => {
    const { get } = fakeGophr(N)
    await new GophrAdapter().listOrders(CREDS, withPageSink({}))
    const cfg = (get.mock.calls[0] as unknown as [string, { params: Record<string, unknown> }])[1]
    expect(cfg.params).toEqual({ 'include-finished': 1, page: 1, count: DEFAULT_COUNT })
  })

  it('a large limit is sent as-is: no maximum is documented for count', async () => {
    const { get } = fakeGophr(3)
    const params = withPageSink({ page: 1, limit: 500 })
    await new GophrAdapter().listOrders(CREDS, params)
    const cfg = (get.mock.calls[0] as unknown as [string, { params: Record<string, unknown> }])[1]
    expect(cfg.params.count).toBe(500)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('declares no maxPageSize', () => {
    const a = new GophrAdapter() as { capabilities?: { maxPageSize?: number } }
    expect(a.capabilities?.maxPageSize).toBeUndefined()
  })

  it('reports no hasMore when the response carries no links', async () => {
    const get = vi.fn(async () => ({ data: { data: { jobs: [job(1)] } } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    const params = withPageSink({ page: 1, limit: L })
    const rows = await new GophrAdapter().listOrders(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['job-1'])
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })
})

describe('gophr listOrders envelope', () => {
  it('rejects a response without data.jobs instead of reporting an empty, finished collection', async () => {
    const get = vi.fn(async () => ({ data: { data: {}, links: { next: null } } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    const params = withPageSink({ page: 1, limit: L })
    await expect(new GophrAdapter().listOrders(CREDS, params)).rejects.toThrow(/data\.jobs/)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })
})

describe('gophr getOrder', () => {
  it('rejects when GET jobs/{job_id} returns no data, rather than building a record', async () => {
    const get = vi.fn(async () => ({ data: {} }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    await expect(new GophrAdapter().getOrder(CREDS, 'job-9')).rejects.toThrow(/no job for job-9/)
  })

  it('reads a listed id back from GET jobs/{job_id} and its data envelope', async () => {
    const { get } = fakeGophr(3)
    const order = await new GophrAdapter().getOrder(CREDS, 'job-2')
    expect(get.mock.calls[0]![0]).toBe('jobs/job-2')
    expect(order.id).toBe('job-2')
    expect(order.shipmentIds).toEqual(['del-2'])
    expect(order.totalAmount).toBe(1200)
    expect(order.currency).toBe('GBP')
  })

  it('encodes the job id into the path', async () => {
    const { get } = fakeGophr(1)
    await new GophrAdapter().getOrder(CREDS, 'a/b').catch(() => undefined)
    expect(get.mock.calls[0]![0]).toBe('jobs/a%2Fb')
  })
})
