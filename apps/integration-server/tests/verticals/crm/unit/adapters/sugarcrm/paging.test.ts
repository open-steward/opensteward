/**
 * SugarCRM list paging: 1-based `page` + caller's `limit` → Sugar's `offset` +
 * `max_num` on GET {instance}/rest/v11_1/<module>, with the end read from
 * `next_offset`.
 *
 * From the "/<module> GET" endpoint reference
 * (https://support.sugarai.com/documentation/sugar_developer/sugar_developer_guide_25.1/integration/web_services/rest_api/endpoints/module_get/):
 *
 *   max_num      "A maximum number of records to return. Default is 20."
 *   offset       "The number of records to skip over before records are returned. Default is 0."
 *   next_offset  "Displays the next offset for retrieval of additional results.
 *                 -1 will be returned when there are no more records."
 *
 * No maximum for max_num is documented, so the adapter declares none and
 * forwards the caller's (router-capped) limit as is.
 *
 * listPipelines reads /Opportunities/enum/sales_stage ("This endpoint does
 * not accept any request arguments.") and synthesises one pipeline, which it
 * pages locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { SugarCrmAdapter } from '../../../../../../src/verticals/crm/adapters/sugarcrm/index'

const INSTANCE = 'https://acme.sugarondemand.com'
const CREDS = { accessToken: 'tok', extra: { instanceUrl: INSTANCE } }

type Call = (a: SugarCrmAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; module: string; call: Call }[] = [
  { name: 'listContacts', module: 'Contacts', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listCompanies', module: 'Accounts', call: (a, p) => a.listCompanies(CREDS, p) },
  { name: 'listDeals', module: 'Opportunities', call: (a, p) => a.listDeals(CREDS, p) },
  { name: 'listActivities', module: 'Tasks', call: (a, p) => a.listActivities(CREDS, p) },
  { name: 'listNotes', module: 'Notes', call: (a, p) => a.listNotes(CREDS, p) },
]

/**
 * A fake Sugar instance that honours ONLY the documented list parameters:
 * `offset` (default 0) and `max_num` (default 20). It answers `next_offset`
 * with -1 at the end, as documented.
 */
function fakeSugar(module: string, total: number, opts: { omitNextOffset?: boolean } = {}) {
  const store = Array.from({ length: total }, (_, i) => ({
    id: `r${String(i + 1).padStart(5, '0')}`,
    name: `n${i + 1}`,
    first_name: `f${i + 1}`,
    last_name: `l${i + 1}`,
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/rest/v11_1/${module}`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const maxNum = Number(url.searchParams.get('max_num') ?? '20')
    if (!Number.isInteger(offset) || offset < 0) {
      return new Response(`bad offset ${String(offset)}`, { status: 400 })
    }
    if (!Number.isInteger(maxNum) || maxNum < 1) {
      return new Response(`bad max_num ${String(maxNum)}`, { status: 400 })
    }
    const records = store.slice(offset, offset + maxNum)
    const end = offset + records.length
    const body = opts.omitNextOffset
      ? { records }
      : { records, next_offset: end >= store.length ? -1 : end }
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

describe.each(LISTS)('sugarcrm $name paging', ({ module, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { store } = fakeSugar(module, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new SugarCrmAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(store.map((r) => r.id))
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented offset and max_num on page 2', async () => {
    const { sent } = fakeSugar(module, 9)
    await call(new SugarCrmAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('offset')).toBe('4')
    expect(sent[0]!.searchParams.get('max_num')).toBe('4')
  })

  it('forwards the sync worker limit of 500 (no documented maximum) and serves every row', async () => {
    const total = 2 * 500 + 1
    const { store, sent } = fakeSugar(module, total)
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      seen.push(...(await call(new SugarCrmAdapter(), params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(500)
    }
    expect(sent.map((u) => u.searchParams.get('max_num'))).toEqual(['500', '500', '500'])
    expect(seen).toEqual(store.map((r) => r.id))
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeSugar(module, 25)
    const adapter = new SugarCrmAdapter()
    const params = parseListQuery({ page: '2', limit: '10' }, adapter as PageMaxBearing)
    const env = listPage(await call(adapter, params), params, 'sugarcrm')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' }, adapter as PageMaxBearing)
    const envLast = listPage(await call(adapter, last), last, 'sugarcrm')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('ends on a full last page when the rows are an exact multiple of the limit', async () => {
    fakeSugar(module, 8)
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new SugarCrmAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reports no hasMore when the response carries no next_offset', async () => {
    fakeSugar(module, 9, { omitNextOffset: true })
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(new SugarCrmAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('sends the adapter default max_num of 25 when no limit is given', async () => {
    const { store, sent } = fakeSugar(module, 60)
    const p1 = withPageSink({ page: 1 })
    const p2 = withPageSink({ page: 2 })
    const rows = [
      ...(await call(new SugarCrmAdapter(), p1)),
      ...(await call(new SugarCrmAdapter(), p2)),
    ].map((r) => r.id)
    expect(sent.map((u) => u.searchParams.get('max_num'))).toEqual(['25', '25'])
    expect(sent.map((u) => u.searchParams.get('offset'))).toEqual(['0', '25'])
    expect(rows).toEqual(store.slice(0, 50).map((r) => r.id))
    expect(readUpstreamPage(p1)?.pageSize).toBe(25)
  })

  it('declares no page maximum, since Sugar documents none', () => {
    expect((new SugarCrmAdapter() as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
  })
})

describe('sugarcrm listPipelines paging', () => {
  it('serves its one synthetic pipeline on page 1 only', async () => {
    const sent: URL[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      sent.push(url)
      return new Response(
        JSON.stringify({ Prospecting: 'Prospecting', 'Closed Won': 'Closed Won' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    })
    const adapter = new SugarCrmAdapter()
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect(await adapter.listPipelines(CREDS, p1)).toHaveLength(1)
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listPipelines(CREDS, p2)).toEqual([])
    expect(sent.every((u) => u.pathname === '/rest/v11_1/Opportunities/enum/sales_stage')).toBe(
      true,
    )
  })
})
