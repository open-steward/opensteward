/**
 * Catalyst listCompanies paging: 1-based `page` + caller's `limit` →
 * Catalyst's `offset` + `limit` on GET /accounts.
 *
 * From https://help.catalyst.io/hc/en-us/articles/34021477455508-Catalyst-API-v1:
 *
 *   "Filters | Applies to /accounts, /notes, /tasks, /emails, /playbooks endpoints:"
 *   "limit → Max number of records to return (default 25, max 100)"
 *   "offset → Offset for pagination (default 0)"
 *
 * The response envelope is not publicly documented, so the end of the
 * collection is a short page.
 *
 * listContacts refuses with 501 (no documented contact endpoint); see
 * requests.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { CatalystAdapter } from '../../../../../../src/verticals/crm/adapters/catalyst/index'

const CREDS = { accessToken: 'key' }
/** Documented: "default 25, max 100". */
const MAX = 100

/**
 * A fake Catalyst that honours ONLY the documented list parameters: `offset`
 * (default 0) and `limit` (default 25, max 100). Out-of-range values are
 * refused rather than corrected.
 */
function fakeCatalyst(total: number) {
  const store = Array.from({ length: total }, (_, i) => ({
    id: `a${String(i + 1).padStart(5, '0')}`,
    name: `Account ${i + 1}`,
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || !url.pathname.endsWith('/accounts')) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const limit = Number(url.searchParams.get('limit') ?? '25')
    if (!Number.isInteger(offset) || offset < 0) {
      return new Response(`bad offset ${String(offset)}`, { status: 400 })
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`bad limit ${String(limit)}`, { status: 400 })
    }
    return new Response(JSON.stringify({ data: store.slice(offset, offset + limit) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { store, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('catalyst listCompanies paging', () => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { store } = fakeCatalyst(2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await new CatalystAdapter().listCompanies(CREDS, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(store.map((r) => r.id))
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented offset on page 2', async () => {
    const { sent } = fakeCatalyst(9)
    await new CatalystAdapter().listCompanies(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('offset')).toBe('4')
    expect(sent[0]!.searchParams.get('limit')).toBe('4')
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const { store, sent } = fakeCatalyst(2 * MAX + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      seen.push(...(await new CatalystAdapter().listCompanies(CREDS, params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['100', '100', '100'])
    expect(sent.map((u) => u.searchParams.get('offset'))).toEqual(['0', '100', '200'])
    expect(seen).toEqual(store.map((r) => r.id))
    expect(more).toEqual([true, true, false])
  })

  // The router passes the adapter, so parseListQuery clamps to its declared
  // maxPageSize of 100.
  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeCatalyst(25)
    const adapter = new CatalystAdapter()
    const params = parseListQuery({ page: '2', limit: '10' }, adapter)
    const env = listPage(await adapter.listCompanies(CREDS, params), params, 'catalyst')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' }, adapter)
    const envLast = listPage(await adapter.listCompanies(CREDS, last), last, 'catalyst')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('walks a caller limit above 100 through parseListQuery at the declared max', async () => {
    const { store, sent } = fakeCatalyst(2 * MAX + 1)
    const adapter = new CatalystAdapter()
    const seen: string[] = []
    const more: (boolean | null)[] = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '500' }, adapter)
      const env = listPage(await adapter.listCompanies(CREDS, params), params, 'catalyst')
      seen.push(...env.data.map((r) => r.id))
      more.push(env.meta.hasMore)
    }
    expect(sent.map((u) => u.searchParams.get('offset'))).toEqual(['0', '100', '200'])
    expect(seen).toEqual(store.map((r) => r.id))
    expect(more).toEqual([true, true, false])
  })

  // Defensive: the router never sends these, but a direct caller could. The
  // fake refuses a non-integer or sub-1 limit, as the documented range implies.
  it('sends an in-range integer limit for a zero or fractional caller limit', async () => {
    const { sent } = fakeCatalyst(9)
    await new CatalystAdapter().listCompanies(CREDS, withPageSink({ page: 1, limit: 0 }))
    await new CatalystAdapter().listCompanies(CREDS, withPageSink({ page: 2, limit: 3.7 }))
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['1', '3'])
    expect(sent.map((u) => u.searchParams.get('offset'))).toEqual(['0', '3'])
  })

  it('sends the documented default limit of 25 when the caller gives none', async () => {
    const { sent } = fakeCatalyst(30)
    const params = withPageSink({ page: 1 })
    expect(await new CatalystAdapter().listCompanies(CREDS, params)).toHaveLength(25)
    expect(sent[0]!.searchParams.get('limit')).toBe('25')
    expect(sent[0]!.searchParams.get('offset')).toBe('0')
  })
})
