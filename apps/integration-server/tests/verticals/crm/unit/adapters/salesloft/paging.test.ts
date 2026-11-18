/**
 * Salesloft list paging.
 *
 * From https://developers.salesloft.com/docs/platform/api-basics/filtering-paging-sorting/:
 *
 *   "per_page is how many records will be returned in a single request. This
 *    number will generally default to 25 and be in the inclusive range [1, 100]."
 *   "If per_page is outside of the allowed range or page is not valid, these
 *    values will be corrected to default values and provided in the response
 *    metadata."
 *
 * The end is metadata.paging.next_page ("value of the next valid page, or null").
 *
 * listPipelines synthesises ONE pipeline from every opportunity stage, so the
 * collection the caller pages over has exactly one row. It pages that row
 * locally, and builds it from every page of GET /v2/opportunity_stages.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { SalesloftAdapter } from '../../../../../../src/verticals/crm/adapters/salesloft/index'

const CREDS = { accessToken: 'tok' }
/** Documented: per_page "in the inclusive range [1, 100]". */
const MAX = 100

/**
 * A fake Salesloft that honours ONLY the documented list parameters: `page`
 * (default 1) and `per_page` (1..100, default 25). An out-of-range value is
 * corrected to the default, as the docs say.
 */
function fakeSalesloft(path: string, total: number) {
  const store = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    name: `s${i + 1}`,
    display_order: i + 1,
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/v2${path}`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    let page = Number(url.searchParams.get('page') ?? '1')
    let perPage = Number(url.searchParams.get('per_page') ?? '25')
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX) perPage = 25
    if (!Number.isInteger(page) || page < 1) page = 1
    const start = (page - 1) * perPage
    const next = start + perPage < store.length ? page + 1 : null
    return new Response(
      JSON.stringify({
        data: store.slice(start, start + perPage),
        metadata: { paging: { per_page: perPage, current_page: page, next_page: next } },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return { store, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('salesloft listPipelines paging', () => {
  it('serves its one pipeline on page 1 only, with exact hasMore, over 2L+1 stages', async () => {
    const L = MAX
    const { store } = fakeSalesloft('/opportunity_stages', 2 * L + 1)
    const adapter = new SalesloftAdapter()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: 1 })
      const rows = await adapter.listPipelines(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      if (k === 1) {
        expect((rows[0]!.stages ?? []).map((s) => s.id)).toEqual(store.map((s) => String(s.id)))
      }
    }
    expect(seen).toEqual(['default'])
    expect(more).toEqual([false, false, false])
  })

  it('walks the stages with the documented page key at per_page 100', async () => {
    const { sent } = fakeSalesloft('/opportunity_stages', 2 * MAX + 1)
    await new SalesloftAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 1 }))
    expect(sent.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3'])
    expect(sent.map((u) => u.searchParams.get('per_page'))).toEqual(['100', '100', '100'])
  })

  it('getPipeline also sees every stage past the first 100', async () => {
    const { store } = fakeSalesloft('/opportunity_stages', 2 * MAX + 1)
    const p = await new SalesloftAdapter().getPipeline(CREDS, 'default')
    expect(p.stages).toHaveLength(store.length)
  })

  /** Scripted upstream: each call returns the next scripted page body. */
  function scripted(pages: { data: unknown[]; next_page: number | null }[]) {
    let i = 0
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const p = pages[Math.min(i++, pages.length - 1)]!
      return new Response(
        JSON.stringify({ data: p.data, metadata: { paging: { next_page: p.next_page } } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    return spy
  }
  const stage = (id: number) => ({ id, name: `s${id}`, display_order: id })

  it('ends the stage walk on an empty page even if next_page is not null', async () => {
    const spy = scripted([
      { data: [stage(1)], next_page: 2 },
      { data: [], next_page: 3 },
      { data: [stage(9)], next_page: null },
    ])
    const p = await new SalesloftAdapter().getPipeline(CREDS, 'default')
    expect(spy).toHaveBeenCalledTimes(2)
    expect((p.stages ?? []).map((s) => s.id)).toEqual(['1'])
  })

  it('ends the stage walk when next_page does not advance', async () => {
    const spy = scripted([
      { data: [stage(1)], next_page: 2 },
      { data: [stage(2)], next_page: 2 },
      { data: [stage(9)], next_page: null },
    ])
    const p = await new SalesloftAdapter().getPipeline(CREDS, 'default')
    expect(spy).toHaveBeenCalledTimes(2)
    expect((p.stages ?? []).map((s) => s.id)).toEqual(['1', '2'])
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const { store } = fakeSalesloft('/opportunity_stages', 150)
    const adapter = new SalesloftAdapter()
    const params = parseListQuery({ page: '1', limit: '500' }, adapter)
    expect(params.limit).toBe(MAX)
    const rows = await adapter.listPipelines(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['default'])
    expect(rows[0]!.stages ?? []).toHaveLength(store.length)
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeSalesloft('/opportunity_stages', 5)
    const adapter = new SalesloftAdapter()
    const p1 = parseListQuery({ page: '1', limit: '10' }, adapter)
    const env = listPage(await adapter.listPipelines(CREDS, p1), p1, 'salesloft')
    expect(env.data).toHaveLength(1)
    expect(env.meta.hasMore).toBe(false)

    const p2 = parseListQuery({ page: '2', limit: '10' }, adapter)
    const env2 = listPage(await adapter.listPipelines(CREDS, p2), p2, 'salesloft')
    expect(env2.data).toEqual([])
    expect(env2.meta.hasMore).toBe(false)
  })
})

type Call = (a: SalesloftAdapter, p: QueryParams) => Promise<unknown[]>

const LISTS: { name: string; path: string; call: Call }[] = [
  { name: 'listContacts', path: '/people', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listCompanies', path: '/accounts', call: (a, p) => a.listCompanies(CREDS, p) },
  { name: 'listDeals', path: '/opportunities', call: (a, p) => a.listDeals(CREDS, p) },
  { name: 'listActivities', path: '/tasks', call: (a, p) => a.listActivities(CREDS, p) },
  { name: 'listNotes', path: '/notes', call: (a, p) => a.listNotes(CREDS, p) },
]

describe.each(LISTS)('salesloft $name under the declared maximum', ({ path, call }) => {
  it('sends a caller limit above 100 as per_page=100, not the corrected default of 25', async () => {
    const { sent } = fakeSalesloft(path, 2 * MAX + 1)
    const adapter = new SalesloftAdapter()
    const params = parseListQuery({ page: '2', limit: '500' }, adapter)
    expect(await call(adapter, params)).toHaveLength(MAX)
    expect(sent[0]!.searchParams.get('per_page')).toBe('100')
    expect(sent[0]!.searchParams.get('page')).toBe('2')
  })
})

describe('salesloft capabilities', () => {
  it('declares the documented maximum', () => {
    expect(new SalesloftAdapter().capabilities?.maxPageSize).toBe(MAX)
  })
})
