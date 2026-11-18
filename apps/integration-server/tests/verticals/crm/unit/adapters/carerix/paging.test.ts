/**
 * Carerix list paging: 1-based `page` + caller's `limit` → Carerix's `start`
 * (offset) + `count` on GET /{Entity}.
 *
 * From https://help.carerix.com/en/articles/9470760-rest-api-methods,
 * "GET $object — List objects matching search criteria.":
 *
 *   start (string, optional, default: 0): Offset; number of objects to skip
 *     from the beginning of the result.
 *   count (string, optional, default: 10): Maximum number of objects to
 *     include in the result.
 *
 * No maximum and no total are documented, so the adapter declares no
 * maxPageSize and reads the end from a short page.
 *
 * listActivities (GET /CRToDo) is walked in activities.test.ts, whose fake
 * serves the CRToDo identifier key (todoID) that its transform requires.
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
import { CarerixAdapter } from '../../../../../../src/verticals/crm/adapters/carerix/index'

const CREDS = { accessToken: 'tok' }

type Call = (a: CarerixAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; entity: string; call: Call }[] = [
  { name: 'listContacts', entity: 'CREmployee', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listCompanies', entity: 'CRCompany', call: (a, p) => a.listCompanies(CREDS, p) },
  { name: 'listDeals', entity: 'CRPublication', call: (a, p) => a.listDeals(CREDS, p) },
  { name: 'listPipelines', entity: 'CRNodeType', call: (a, p) => a.listPipelines(CREDS, p) },
  { name: 'listNotes', entity: 'CRNote', call: (a, p) => a.listNotes(CREDS, p) },
]

/**
 * A fake Carerix that honours ONLY the documented list parameters: `start`
 * (offset, default 0) and `count` (default 10). Anything malformed is refused.
 */
function fakeCarerix(entity: string, total: number) {
  const store = Array.from({ length: total }, (_, i) => ({
    id: String(i + 1).padStart(5, '0'),
    name: `n${i + 1}`,
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/${entity}`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const start = Number(url.searchParams.get('start') ?? '0')
    const count = Number(url.searchParams.get('count') ?? '10')
    if (!Number.isInteger(start) || start < 0) {
      return new Response(`bad start ${String(start)}`, { status: 400 })
    }
    if (!Number.isInteger(count) || count < 1) {
      return new Response(`bad count ${String(count)}`, { status: 400 })
    }
    return new Response(JSON.stringify(store.slice(start, start + count)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { store, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(LISTS)('carerix $name paging', ({ entity, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { store } = fakeCarerix(entity, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new CarerixAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(store.map((r) => r.id))
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented start offset and count on page 2', async () => {
    const { sent } = fakeCarerix(entity, 9)
    await call(new CarerixAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('start')).toBe('4')
    expect(sent[0]!.searchParams.get('count')).toBe('4')
  })

  it('forwards a large limit unclamped (no documented maximum) and still serves every row', async () => {
    const L = 500
    const { store, sent } = fakeCarerix(entity, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new CarerixAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(sent.map((u) => u.searchParams.get('count'))).toEqual(['500', '500', '500'])
    expect(sent.map((u) => u.searchParams.get('start'))).toEqual(['0', '500', '1000'])
    expect(seen).toEqual(store.map((r) => r.id))
    expect(more).toEqual([true, true, false])
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeCarerix(entity, 25)
    const adapter = new CarerixAdapter()
    const params = parseListQuery({ page: '2', limit: '10' }, adapter as PageMaxBearing)
    const env = listPage(await call(adapter, params), params, 'carerix')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' }, adapter as PageMaxBearing)
    const envLast = listPage(await call(adapter, last), last, 'carerix')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })
})

describe('carerix capabilities', () => {
  it('declares no maxPageSize, since Carerix documents none', () => {
    expect((new CarerixAdapter() as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
  })
})

describe('carerix fallback page size', () => {
  it('sends the adapter default of 25 for both count and offset when no limit is given', async () => {
    const { sent } = fakeCarerix('CREmployee', 60)
    const params = withPageSink({ page: 2 })
    const rows = await new CarerixAdapter().listContacts(CREDS, params)
    expect(sent[0]!.searchParams.get('count')).toBe('25')
    expect(sent[0]!.searchParams.get('start')).toBe('25')
    expect(rows).toHaveLength(25)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
