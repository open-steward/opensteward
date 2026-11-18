/**
 * Podio list paging.
 *
 * Items (contacts, companies, deals) come from Get items,
 * https://developers.podio.com/doc/items/get-items-27803:
 *
 *   limit:  "The maximum number of items to return"
 *   offset: "The offset from the start of the items returned"
 *   "filtered": Total number of items matching the filter
 *
 * No maximum is documented, so the adapter declares none and forwards the
 * caller's limit as is.
 *
 * Pipelines are synthesised from one Get app call,
 * https://developers.podio.com/doc/applications/get-app-22349, which takes
 * only app_id: one row, paged locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  MAX_PAGE_LIMIT,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { PodioAdapter } from '../../../../../../src/verticals/crm/adapters/podio/index'

const CREDS = {
  accessToken: 'tok',
  extra: { contactAppId: 'c1', companyAppId: 'co1', dealAppId: 'd1' },
}

type Call = (a: PodioAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; appId: string; call: Call }[] = [
  { name: 'listContacts', appId: 'c1', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listCompanies', appId: 'co1', call: (a, p) => a.listCompanies(CREDS, p) },
  { name: 'listDeals', appId: 'd1', call: (a, p) => a.listDeals(CREDS, p) },
]

/**
 * A fake Podio that honours ONLY the documented Get items parameters:
 * `limit` (default 10) and `offset` (default 0). The body carries `total`
 * and `filtered`; `counts: false` drops both.
 */
function fakePodio(
  appId: string,
  total: number,
  opts: { counts?: boolean; appTotal?: number } = {},
) {
  const store = Array.from({ length: total }, (_, i) => ({ item_id: i + 1, fields: [] }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/item/app/${appId}/`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const limit = Number(url.searchParams.get('limit') ?? '10')
    const offset = Number(url.searchParams.get('offset') ?? '0')
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1) {
      return new Response('bad paging', { status: 400 })
    }
    const body: Record<string, unknown> = { items: store.slice(offset, offset + limit) }
    if (opts.counts !== false) {
      body['total'] = opts.appTotal ?? store.length
      body['filtered'] = store.length
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { ids: store.map((r) => String(r.item_id)), sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(LISTS)('podio $name paging', ({ appId, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { ids } = fakePodio(appId, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new PodioAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented offset and limit on page 2', async () => {
    const { sent } = fakePodio(appId, 9)
    await call(new PodioAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('offset')).toBe('4')
    expect(sent[0]!.searchParams.get('limit')).toBe('4')
  })

  it('declares no maximum; a large direct limit is forwarded and serves every row', async () => {
    expect((new PodioAdapter() as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
    const L = 1000
    const { ids, sent } = fakePodio(appId, 2 * L + 1)
    const seen: string[] = []
    for (const k of [1, 2, 3]) {
      seen.push(
        ...(await call(new PodioAdapter(), withPageSink({ page: k, limit: L }))).map((r) => r.id),
      )
    }
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['1000', '1000', '1000'])
    expect(seen).toEqual(ids)
  })

  it('clamps an API limit above the router maximum and still serves every row', async () => {
    const { ids, sent } = fakePodio(appId, 2 * MAX_PAGE_LIMIT + 1)
    const adapter = new PodioAdapter()
    const seen: string[] = []
    for (const k of ['1', '2', '3']) {
      const params = parseListQuery({ page: k, limit: '5000' }, adapter as PageMaxBearing)
      seen.push(...(await call(adapter, params)).map((r) => r.id))
    }
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(
      Array(3).fill(String(MAX_PAGE_LIMIT)),
    )
    expect(seen).toEqual(ids)
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakePodio(appId, 25)
    const adapter = new PodioAdapter()
    const params = parseListQuery({ page: '2', limit: '10' }, adapter as PageMaxBearing)
    const env = listPage(await call(adapter, params), params, 'podio')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' }, adapter as PageMaxBearing)
    const envLast = listPage(await call(adapter, last), last, 'podio')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('ends on a full last page when the rows are an exact multiple of the limit', async () => {
    fakePodio(appId, 8)
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new PodioAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(8)
  })

  it('ends on filtered, not on the app total, when the two differ', async () => {
    // `total` counts every item in the app; `filtered` the items matching
    // the request, which is what the pages walk.
    fakePodio(appId, 8, { appTotal: 20 })
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new PodioAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(8)
  })

  it('sends limit 25 and offset 0 when the caller gives no limit', async () => {
    const { sent } = fakePodio(appId, 30)
    const params = withPageSink({})
    expect(await call(new PodioAdapter(), params)).toHaveLength(25)
    expect(sent[0]!.searchParams.get('limit')).toBe('25')
    expect(sent[0]!.searchParams.get('offset')).toBe('0')
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports nothing when the response carries no count', async () => {
    fakePodio(appId, 9, { counts: false })
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(new PodioAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)).toBeUndefined()
  })
})

describe('podio listPipelines paging', () => {
  function fakeApp() {
    const sent: URL[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      sent.push(url)
      if (url.pathname !== '/app/d1') return new Response('nope', { status: 404 })
      const app = {
        app_id: 1,
        config: { name: 'Deals' },
        fields: [
          {
            external_id: 'stage',
            config: { settings: { options: [{ id: 1, text: 'Open', status: 'active' }] } },
          },
        ],
      }
      return new Response(JSON.stringify(app), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    return sent
  }

  it('serves its one row on page 1 only, with exact hasMore', async () => {
    fakeApp()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: 1 })
      seen.push(...(await new PodioAdapter().listPipelines(CREDS, params)).map((p) => p.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['d1'])
    expect(more).toEqual([false, false, false])
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeApp()
    const adapter = new PodioAdapter()
    const params = parseListQuery({ page: '2', limit: '10' }, adapter as PageMaxBearing)
    const env = listPage(await adapter.listPipelines(CREDS, params), params, 'podio')
    expect(env.data).toHaveLength(0)
    expect(env.meta.hasMore).toBe(false)
  })

  it('getPipeline still finds the pipeline', async () => {
    fakeApp()
    expect((await new PodioAdapter().getPipeline(CREDS, 'd1')).id).toBe('d1')
  })
})
