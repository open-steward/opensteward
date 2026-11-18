/**
 * Insightly list paging: 1-based `page` + caller's `limit` → Insightly's
 * `skip` + `top`, with the end read from the X-Total-Count header.
 *
 * From https://api.insightly.com/v3.1/Help:
 *
 *   "To page through the recordset, use the top and skip query string
 *    parameters to specify the number of records to return and the starting
 *    record position."
 *   "with 100 records per response (default) and a maximum of 500 records
 *    per response."
 *   "Add the count_total=True parameter to get the total number of records
 *    returned in a response header called X-Total-Count"
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { InsightlyAdapter } from '../../../../../../src/verticals/crm/adapters/insightly/index'

const CREDS = { accessToken: 'key' }
/** Documented: "a maximum of 500 records per response". */
const MAX = 500

type Call = (a: InsightlyAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; path: string; idKey: string; call: Call }[] = [
  {
    name: 'listContacts',
    path: 'Contacts',
    idKey: 'CONTACT_ID',
    call: (a, p) => a.listContacts(CREDS, p),
  },
  {
    name: 'listCompanies',
    path: 'Organisations',
    idKey: 'ORGANISATION_ID',
    call: (a, p) => a.listCompanies(CREDS, p),
  },
  {
    name: 'listDeals',
    path: 'Opportunities',
    idKey: 'OPPORTUNITY_ID',
    call: (a, p) => a.listDeals(CREDS, p),
  },
  {
    name: 'listPipelines',
    path: 'Pipelines',
    idKey: 'PIPELINE_ID',
    call: (a, p) => a.listPipelines(CREDS, p),
  },
  {
    name: 'listActivities',
    path: 'Tasks',
    idKey: 'TASK_ID',
    call: (a, p) => a.listActivities(CREDS, p),
  },
  { name: 'listNotes', path: 'Notes', idKey: 'NOTE_ID', call: (a, p) => a.listNotes(CREDS, p) },
]

/**
 * A fake Insightly that honours ONLY the documented list parameters: `skip`
 * (default 0), `top` (default 100, max 500) and `count_total` (adds the
 * X-Total-Count header). The body is a bare JSON array.
 */
function fakeInsightly(
  path: string,
  idKey: string,
  total: number,
  /** Override the X-Total-Count header: `null` omits it even when asked for. */
  totalHeader?: string | null,
) {
  const store = Array.from({ length: total }, (_, i) => ({ [idKey]: i + 1 }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/v3.1/${path}`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const skip = Number(url.searchParams.get('skip') ?? '0')
    const top = Number(url.searchParams.get('top') ?? '100')
    if (!Number.isInteger(skip) || skip < 0) {
      return new Response(`bad skip ${String(skip)}`, { status: 400 })
    }
    if (!Number.isInteger(top) || top < 1 || top > MAX) {
      return new Response(`bad top ${String(top)}`, { status: 400 })
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (url.searchParams.get('count_total')?.toLowerCase() === 'true') {
      if (totalHeader !== null) headers['X-Total-Count'] = totalHeader ?? String(store.length)
    }
    return new Response(JSON.stringify(store.slice(skip, skip + top)), { status: 200, headers })
  })
  return { ids: store.map((r) => String(r[idKey])), sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(LISTS)('insightly $name paging', ({ path, idKey, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeInsightly(path, idKey, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new InsightlyAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented skip and top on page 2', async () => {
    const { sent } = fakeInsightly(path, idKey, 9)
    await call(new InsightlyAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('skip')).toBe('4')
    expect(sent[0]!.searchParams.get('top')).toBe('4')
  })

  it('clamps a limit above 500 and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { ids, sent } = fakeInsightly(path, idKey, total)
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 1000 })
      seen.push(...(await call(new InsightlyAdapter(), params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
    }
    expect(sent.map((u) => u.searchParams.get('top'))).toEqual(['500', '500', '500'])
    expect(seen).toEqual(ids)
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeInsightly(path, idKey, 25)
    const adapter = new InsightlyAdapter()
    const params = parseListQuery({ page: '2', limit: '10' }, adapter)
    const env = listPage(await call(adapter, params), params, 'insightly')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' }, adapter)
    const envLast = listPage(await call(adapter, last), last, 'insightly')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('ends on a full last page when the rows are an exact multiple of the limit', async () => {
    fakeInsightly(path, idKey, 8)
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new InsightlyAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(8)
  })

  it.each([
    ['missing', null],
    ['unreadable', 'many'],
  ] as const)(
    'falls back to a short page as the end when X-Total-Count is %s',
    async (_label, header) => {
      const L = 4
      const { ids } = fakeInsightly(path, idKey, 2 * L + 1, header)
      const seen: string[] = []
      const more: (boolean | undefined)[] = []
      const totals: (number | undefined)[] = []
      for (const k of [1, 2, 3]) {
        const params = withPageSink({ page: k, limit: L })
        seen.push(...(await call(new InsightlyAdapter(), params)).map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        totals.push(readUpstreamPage(params)?.totalCount)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      expect(totals).toEqual([undefined, undefined, undefined])
    },
  )

  it.each([
    [undefined, '25'],
    [0, '1'],
    [2.7, '2'],
  ])('sends top for a direct limit of %s as %s', async (limit, top) => {
    const { sent } = fakeInsightly(path, idKey, 30)
    await call(
      new InsightlyAdapter(),
      withPageSink({ page: 1, ...(limit === undefined ? {} : { limit }) }),
    )
    expect(sent[0]!.searchParams.get('top')).toBe(top)
  })

  it('declares the documented maximum', () => {
    expect(new InsightlyAdapter().capabilities?.maxPageSize).toBe(MAX)
  })
})
