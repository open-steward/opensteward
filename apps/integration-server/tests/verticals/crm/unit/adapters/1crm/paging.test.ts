/**
 * 1CRM list paging: 1-based `page` + caller's `limit` → 1CRM's `offset` +
 * `limit` on GET /api.php/data/{model}, with the end of the collection read
 * from `total_results`.
 *
 * From https://demo.1crmcloud.com/api.php, "Get list of records":
 *
 *   offset        Int [0:] (0)    "Offset in the list to start retrieval from"
 *   limit         Int [1:200] (20) "Limits number of records returned"
 *   total_results "Total number of results, without taking offset and limit in account"
 *
 * listPipelines makes no request (the pipeline is synthesised from 1CRM's
 * stage enum), so it pages its one row locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { OneCrmAdapter } from '../../../../../../src/verticals/crm/adapters/1crm/index'

const CREDS = { accessToken: 'tok', extra: { baseUrl: 'https://acme.1crmcloud.com' } }
/** Documented: limit "Int [1:200]". */
const MAX = 200

type Call = (a: OneCrmAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; model: string; call: Call }[] = [
  { name: 'listContacts', model: 'Contact', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listCompanies', model: 'Account', call: (a, p) => a.listCompanies(CREDS, p) },
  { name: 'listDeals', model: 'Opportunity', call: (a, p) => a.listDeals(CREDS, p) },
  { name: 'listActivities', model: 'Task', call: (a, p) => a.listActivities(CREDS, p) },
  { name: 'listNotes', model: 'Note', call: (a, p) => a.listNotes(CREDS, p) },
]

/**
 * A fake 1CRM that honours ONLY the documented list parameters: `offset`
 * (Int, from 0, default 0) and `limit` (Int 1..200, default 20). Anything
 * out of range is refused rather than corrected.
 */
function fake1crm(model: string, total: number, opts: { noTotal?: boolean } = {}) {
  const store = Array.from({ length: total }, (_, i) => ({
    id: `r${String(i + 1).padStart(5, '0')}`,
    name: `n${i + 1}`,
    first_name: `f${i + 1}`,
    last_name: `l${i + 1}`,
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/api.php/data/${model}`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const limit = Number(url.searchParams.get('limit') ?? '20')
    if (!Number.isInteger(offset) || offset < 0) {
      return new Response(`bad offset ${String(offset)}`, { status: 400 })
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`bad limit ${String(limit)}`, { status: 400 })
    }
    return new Response(
      JSON.stringify({
        records: store.slice(offset, offset + limit),
        ...(opts.noTotal ? {} : { total_results: store.length }),
        offset,
        limit,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return { store, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(LISTS)('1crm $name paging', ({ model, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { store } = fake1crm(model, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new OneCrmAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(store.map((r) => r.id))
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented offset on page 2', async () => {
    const { sent } = fake1crm(model, 9)
    await call(new OneCrmAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('offset')).toBe('4')
    expect(sent[0]!.searchParams.get('limit')).toBe('4')
  })

  it('clamps a limit above 200 and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { store, sent } = fake1crm(model, total)
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      seen.push(...(await call(new OneCrmAdapter(), params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
    }
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['200', '200', '200'])
    expect(seen).toEqual(store.map((r) => r.id))
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fake1crm(model, 25)
    const adapter = new OneCrmAdapter()
    const params = parseListQuery({ page: '2', limit: '10' }, adapter)
    const env = listPage(await call(adapter, params), params, '1crm')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' }, adapter)
    const envLast = listPage(await call(adapter, last), last, '1crm')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('claims no end when 1CRM omits total_results', async () => {
    fake1crm(model, 25, { noTotal: true })
    const adapter = new OneCrmAdapter()
    const params = parseListQuery({ page: '1', limit: '10' }, adapter)
    const env = listPage(await call(adapter, params), params, '1crm')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).not.toBe(false)
  })

  it('ends on a full last page when the rows are an exact multiple of the limit', async () => {
    // 8 rows at limit 4: page 2 is full, yet total_results says it is the end.
    fake1crm(model, 8)
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new OneCrmAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reports total_results as the totalCount', async () => {
    const { store } = fake1crm(model, 9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(new OneCrmAdapter(), params)
    expect(readUpstreamPage(params)?.totalCount).toBe(store.length)
  })

  it('sends the documented default limit of 20 when the caller gives none', async () => {
    const { sent } = fake1crm(model, 25)
    const params = withPageSink({ page: 1 })
    expect(await call(new OneCrmAdapter(), params)).toHaveLength(20)
    expect(sent[0]!.searchParams.get('limit')).toBe('20')
    expect(sent[0]!.searchParams.get('offset')).toBe('0')
  })

  it('raises a limit below 1 and floors a fractional limit into the documented range', async () => {
    const { sent } = fake1crm(model, 9)
    await call(new OneCrmAdapter(), withPageSink({ page: 1, limit: 0 }))
    await call(new OneCrmAdapter(), withPageSink({ page: 2, limit: 2.5 }))
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['1', '2'])
    expect(sent[1]!.searchParams.get('offset')).toBe('2')
  })

  it('declares the documented maximum', () => {
    expect(new OneCrmAdapter().capabilities?.maxPageSize).toBe(MAX)
  })
})

describe('1crm listPipelines paging', () => {
  it('serves its one synthetic pipeline on page 1 only', async () => {
    const adapter = new OneCrmAdapter()
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect(await adapter.listPipelines(CREDS, p1)).toHaveLength(1)
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listPipelines(CREDS, p2)).toEqual([])
  })
})
