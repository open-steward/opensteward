/**
 * Recruit CRM list paging: 1-based `page` + caller's `limit` → Recruit CRM's
 * `page` + `limit` query parameters, with the end read from `next_page_url`.
 *
 * From the Recruit CRM API reference (Stoplight, docs.recruitcrm.io), on
 * GET /v1/contacts, /v1/companies, /v1/deals and /v1/notes:
 *
 *   page:  "Page Number for Pagination"
 *   limit: "Limit of records per page. (Max:100)"
 *   next_page_url: "URL of the next page" (null on the last page)
 *
 * The response is a Laravel envelope with no total count. listActivities and
 * listPipelines are covered in activities.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { RecruitCrmAdapter } from '../../../../../../src/verticals/crm/adapters/recruit-crm/index'

const CREDS = { accessToken: 'rcrm_test' }
/** Documented: "Limit of records per page. (Max:100)". */
const MAX = 100

type Call = (a: RecruitCrmAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; path: string; call: Call }[] = [
  { name: 'listContacts', path: 'contacts', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listCompanies', path: 'companies', call: (a, p) => a.listCompanies(CREDS, p) },
  { name: 'listDeals', path: 'deals', call: (a, p) => a.listDeals(CREDS, p) },
  { name: 'listNotes', path: 'notes', call: (a, p) => a.listNotes(CREDS, p) },
]

/**
 * A fake Recruit CRM that honours ONLY the documented `page` and `limit`
 * (max 100). Any other paging parameter (per_page, after) is ignored, as an
 * undocumented parameter would be; an out-of-range limit is refused.
 */
function fakeRecruitCrm(path: string, total: number) {
  const store = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    slug: `s${i + 1}`,
    first_name: `f${i + 1}`,
    last_name: `l${i + 1}`,
    company_name: `c${i + 1}`,
    name: `n${i + 1}`,
    description: `d${i + 1}`,
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/v1/${path}`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '25')
    if (!Number.isInteger(page) || page < 1) {
      return new Response(`bad page ${String(page)}`, { status: 400 })
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`bad limit ${String(limit)}`, { status: 400 })
    }
    const from = (page - 1) * limit
    const data = store.slice(from, from + limit)
    const hasNext = from + limit < store.length
    const base = `https://api.recruitcrm.io/v1/${path}`
    return new Response(
      JSON.stringify({
        current_page: page,
        per_page: limit,
        from: data.length ? from + 1 : null,
        to: data.length ? from + data.length : null,
        path: base,
        first_page_url: `${base}?page=1`,
        next_page_url: hasNext ? `${base}?page=${page + 1}` : null,
        prev_page_url: page > 1 ? `${base}?page=${page - 1}` : null,
        data,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return { ids: store.map((r) => String(r.id)), sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(LISTS)('recruit-crm $name paging', ({ path, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeRecruitCrm(path, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new RecruitCrmAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented page and limit on page 2', async () => {
    const { sent } = fakeRecruitCrm(path, 9)
    await call(new RecruitCrmAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('page')).toBe('2')
    expect(sent[0]!.searchParams.get('limit')).toBe('4')
    expect(sent[0]!.searchParams.has('per_page')).toBe(false)
  })

  it('reports the unclamped caller limit as pageSize', async () => {
    fakeRecruitCrm(path, 9)
    const params = withPageSink({ page: 2, limit: 4 })
    await call(new RecruitCrmAdapter(), params)
    expect(readUpstreamPage(params)?.pageSize).toBe(4)
  })

  it('sends limit 25 when the caller gives none, and at least 1', async () => {
    const { sent } = fakeRecruitCrm(path, 30)
    const noLimit = withPageSink({ page: 1 } as QueryParams)
    expect(await call(new RecruitCrmAdapter(), noLimit)).toHaveLength(25)
    expect(readUpstreamPage(noLimit)?.pageSize).toBe(25)
    await call(new RecruitCrmAdapter(), withPageSink({ page: 1, limit: 0 }))
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['25', '1'])
  })

  it('treats a page below 1 or fractional as a whole 1-based page', async () => {
    const { sent } = fakeRecruitCrm(path, 9)
    await call(new RecruitCrmAdapter(), withPageSink({ page: 0, limit: 4 }))
    await call(new RecruitCrmAdapter(), withPageSink({ page: 2.7, limit: 4 }))
    expect(sent.map((u) => u.searchParams.get('page'))).toEqual(['1', '2'])
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const { ids, sent } = fakeRecruitCrm(path, 2 * MAX + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      seen.push(...(await call(new RecruitCrmAdapter(), params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['100', '100', '100'])
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeRecruitCrm(path, 25)
    const adapter = new RecruitCrmAdapter()
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await call(adapter, params), params, 'recruit-crm')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' })
    const envLast = listPage(await call(adapter, last), last, 'recruit-crm')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('ends on a full last page when the rows are an exact multiple of the limit', async () => {
    fakeRecruitCrm(path, 8)
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new RecruitCrmAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
