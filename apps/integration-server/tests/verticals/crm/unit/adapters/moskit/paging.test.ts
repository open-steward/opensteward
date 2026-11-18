/**
 * Moskit top-level lists: the caller's 1-based page and limit become the
 * documented `start` and `quantity`, and hasMore comes from
 * `X-Ollow-Listing-Total`.
 *
 * Paginação e ordenação (https://stoplight.io/api/v1/projects/cHJqOjcwNDY/nodes/a0ad669547adb):
 *   "start | A partir de qual registro buscar ... | 0 | start + quantity de ser menor que 10.000"
 *   "quantity | Quantidade de registros para receber da busca | 10 | 50"
 *   "X-Ollow-Listing-Total | Número total de resultados encontrados para esta busca"
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { MoskitAdapter } from '../../../../../../src/verticals/crm/adapters/moskit/index'
import { CREDS, HOST, fakeMoskit, rows } from './fake-moskit'

afterEach(() => {
  vi.restoreAllMocks()
})

type ListMethod =
  'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listPipelines'
const LISTS: Array<[ListMethod, string]> = [
  ['listContacts', 'contacts'],
  ['listCompanies', 'companies'],
  ['listDeals', 'deals'],
  ['listActivities', 'activities'],
  ['listPipelines', 'pipelines'],
]

describe.each(LISTS)('moskit %s', (method, coll) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const store = rows(2 * L + 1)
    fakeMoskit({ [coll]: store, stages: [] })
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    const totals: (number | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await new MoskitAdapter()[method](CREDS, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      totals.push(readUpstreamPage(params)?.totalCount)
    }
    expect(seen).toEqual(store.map((r) => String(r.id)))
    expect(more).toEqual([true, true, false])
    expect(totals).toEqual([9, 9, 9])
  })

  it(`sends only start and quantity to GET /v2/${coll} on the documented host`, async () => {
    const { sent } = fakeMoskit({ [coll]: rows(9), stages: [] })
    await new MoskitAdapter()[method](CREDS, withPageSink({ page: 2, limit: 4 }))
    const req = sent.find((u) => u.pathname === `/v2/${coll}`)!
    expect(req.host).toBe(HOST)
    expect([...req.searchParams.keys()].sort()).toEqual(['quantity', 'start'])
    expect(req.searchParams.get('start')).toBe('4')
    expect(req.searchParams.get('quantity')).toBe('4')
  })

  it('clamps a limit above 50, reports the size sent, and still serves every row', async () => {
    const store = rows(101)
    const { sent } = fakeMoskit({ [coll]: store, stages: [] })
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 500 })
      seen.push(...(await new MoskitAdapter()[method](CREDS, params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(50)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    const reqs = sent.filter((u) => u.pathname === `/v2/${coll}`)
    expect(reqs.map((u) => u.searchParams.get('quantity'))).toEqual(['50', '50', '50'])
    expect(reqs.map((u) => u.searchParams.get('start'))).toEqual(['0', '50', '100'])
    expect(seen).toEqual(store.map((r) => String(r.id)))
    expect(more).toEqual([true, true, false])
  })

  it('gives the right meta.hasMore through parseListQuery + listPage at the declared max', async () => {
    fakeMoskit({ [coll]: rows(25), stages: [] })
    const adapter = new MoskitAdapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, adapter)
    // The five list methods return different canonical types; listPage needs one.
    const rows2: Array<{ id: string }> = await adapter[method](CREDS, p2)
    const env = listPage(rows2, p2, 'moskit')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '10' }, adapter)
    const rows3: Array<{ id: string }> = await adapter[method](CREDS, p3)
    const envLast = listPage(rows3, p3, 'moskit')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it("surfaces the vendor's 422 past the documented 10,000-row offset ceiling", async () => {
    fakeMoskit({ [coll]: rows(3), stages: [] })
    await expect(
      new MoskitAdapter()[method](CREDS, withPageSink({ page: 201, limit: 50 })),
    ).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('moskit listing total header', () => {
  it.each(['-1', '-2', 'abc', '2.5', ''])(
    'reports no totalCount or hasMore for a total header of %j',
    async (header) => {
      fakeMoskit({ deals: rows(3) }, {}, { totalHeader: () => header })
      const params = withPageSink({ page: 1, limit: 2 })
      expect(await new MoskitAdapter().listDeals(CREDS, params)).toHaveLength(2)
      expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
      expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    },
  )
})

describe('moskit capabilities', () => {
  it('declares the documented quantity maximum', () => {
    expect(new MoskitAdapter().capabilities.maxPageSize).toBe(50)
  })
})

describe('moskit list bodies', () => {
  it('refuses a body that is not the documented array rather than report an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    )
    await expect(
      new MoskitAdapter().listDeals(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })
})
