/**
 * Upsales request shape and paging, against a fake that honours only what the
 * first-party collection documents
 * (https://api.upsales.com/api/collections/4421023/RW87rVf1?segregateAuth=true&versionTag=latest):
 *
 *   - host and auth: "https://integration.upsales.com/api/v2/contacts/?token={{token}}"
 *     (every request passes the API key as `token`; the collection has no
 *     Authorization header);
 *   - paths: /contacts/, /accounts/?isExternal=0, /orders?probability=gte:1&probability=lte:99,
 *     /orderstages, /activities/, and /<resource>/{{id}} for a single record;
 *   - Pagination: "The default limit is set to 1000 and the maximum limit is
 *     2000. To retreieve the next page you use the offset -parameter [...] It's
 *     value is the number of entries that you want to skip. To be 100% sure you
 *     get all entities you need sort on ID";
 *   - list envelope: { error, metadata: { total, limit, offset }, data }.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { UpsalesAdapter } from '../../../../../../src/verticals/crm/adapters/upsales'

const TOKEN = 'ups_key'
const CREDS = { accessToken: TOKEN }
const MAX = 2000

type Row = { id: number; probability?: number; [k: string]: unknown }

interface FakeOptions {
  contacts?: Row[]
  accounts?: Row[]
  orders?: Row[]
  orderstages?: Row[]
  activities?: Row[]
}

/** Query keys each list path accepts besides token/sort/limit/offset. */
const FILTERS: Record<string, string[]> = {
  '/api/v2/contacts/': [],
  '/api/v2/accounts/': ['isExternal'],
  '/api/v2/orders': ['probability'],
  '/api/v2/orderstages': [],
  '/api/v2/activities/': [],
}
const STORE_KEY: Record<string, keyof FakeOptions> = {
  '/api/v2/contacts/': 'contacts',
  '/api/v2/accounts/': 'accounts',
  '/api/v2/orders': 'orders',
  '/api/v2/orderstages': 'orderstages',
  '/api/v2/activities/': 'activities',
}
const GET_PATHS: Record<string, keyof FakeOptions> = {
  contacts: 'contacts',
  accounts: 'accounts',
  orders: 'orders',
  activities: 'activities',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fakeUpsales(opts: FakeOptions) {
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    sent.push(url)
    const headers = new Headers(init?.headers)
    if (url.origin !== 'https://integration.upsales.com')
      return new Response('bad host', { status: 404 })
    if (headers.has('authorization'))
      return new Response('undocumented auth header', { status: 400 })
    if (url.searchParams.getAll('token').join() !== TOKEN)
      return new Response('Unauthorized', { status: 401 })
    if ((init?.method ?? 'GET') !== 'GET') return new Response('unexpected method', { status: 405 })

    const single = /^\/api\/v2\/(contacts|accounts|orders|activities)\/(\d+)$/.exec(url.pathname)
    if (single) {
      const extra = [...url.searchParams.keys()].filter((k) => k !== 'token')
      if (extra.length > 0)
        return new Response(`unexpected query ${extra.join(',')}`, { status: 400 })
      const row = (opts[GET_PATHS[single[1]!]!] ?? []).find((r) => r.id === Number(single[2]))
      return row ? json({ error: null, data: row }) : new Response('not found', { status: 404 })
    }

    const allowed = FILTERS[url.pathname]
    if (!allowed) return new Response(`unexpected path ${url.pathname}`, { status: 404 })
    const unknown = [...url.searchParams.keys()].filter(
      (k) => !['token', 'sort', 'limit', 'offset', ...allowed].includes(k),
    )
    if (unknown.length > 0)
      return new Response(`unexpected query ${unknown.join(',')}`, { status: 400 })
    const sort = url.searchParams.get('sort')
    if (sort !== null && sort !== 'id') return new Response(`bad sort ${sort}`, { status: 400 })
    const limit = Number(url.searchParams.get('limit') ?? '1000')
    const offset = Number(url.searchParams.get('offset') ?? '0')
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
      return new Response(`bad limit ${limit}`, { status: 400 })
    if (!Number.isInteger(offset) || offset < 0)
      return new Response(`bad offset ${offset}`, { status: 400 })

    let rows = [...(opts[STORE_KEY[url.pathname]!] ?? [])]
    if (sort === 'id') rows.sort((a, b) => a.id - b.id)
    if (url.pathname === '/api/v2/accounts/' && url.searchParams.get('isExternal') === '0') {
      rows = rows.filter((r) => r['isExternal'] === 0)
    }
    for (const f of url.searchParams.getAll('probability')) {
      const [op, v] = f.split(':')
      const n = Number(v)
      rows = rows.filter((r) =>
        op === 'gte'
          ? r.probability! >= n
          : op === 'lte'
            ? r.probability! <= n
            : r.probability === n,
      )
    }
    return json({
      error: null,
      metadata: { total: rows.length, limit, offset },
      data: rows.slice(offset, offset + limit),
    })
  })
  return { sent }
}

function rows(n: number, extra: (i: number) => Record<string, unknown> = () => ({})): Row[] {
  // Stored out of id order, so only `sort=id` gives a stable walk.
  return Array.from({ length: n }, (_, i) => ({ id: n - i, ...extra(n - i) }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

type ListName = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'

async function walk(method: ListName, L: number, pages: number) {
  const adapter = new UpsalesAdapter()
  const seen: string[] = []
  const more: (boolean | undefined)[] = []
  const totals: (number | undefined)[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L })
    const got = await adapter[method](CREDS, params)
    expect(got.length).toBeLessThanOrEqual(L)
    seen.push(...got.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { seen, more, totals }
}

describe('upsales list paging (offset + limit, sort=id, metadata.total)', () => {
  const L = 2
  const N = 2 * L + 1

  it('listContacts serves every contact once over 3 pages with exact hasMore', async () => {
    const { sent } = fakeUpsales({ contacts: rows(N) })
    const { seen, more, totals } = await walk('listContacts', L, 3)
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(more).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
    expect(sent.map((u) => u.pathname)).toEqual(Array(3).fill('/api/v2/contacts/'))
    expect(sent.map((u) => u.searchParams.get('offset'))).toEqual(['0', '2', '4'])
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(['2', '2', '2'])
    expect(sent.every((u) => u.searchParams.get('sort') === 'id')).toBe(true)
  })

  it('listCompanies sends isExternal=0 and skips identified web visits', async () => {
    const accounts = rows(N + 2, (id) => ({ name: `Co ${id}`, isExternal: id > N ? 1 : 0 }))
    const { sent } = fakeUpsales({ accounts })
    const { seen, more } = await walk('listCompanies', L, 3)
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(more).toEqual([true, true, false])
    expect(sent.map((u) => u.pathname)).toEqual(Array(3).fill('/api/v2/accounts/'))
    expect(sent.every((u) => u.searchParams.get('isExternal') === '0')).toBe(true)
  })

  it('listDeals asks only for opportunities (probability 1..99)', async () => {
    // Ids 6..8 are a won order (100), a lost order (0) and another won order.
    const orders = [
      ...rows(N, () => ({ description: 'Opp', probability: 50 })),
      { id: 6, description: 'Won', probability: 100 },
      { id: 7, description: 'Lost', probability: 0 },
      { id: 8, description: 'Won', probability: 100 },
    ]
    const { sent } = fakeUpsales({ orders })
    const { seen, more } = await walk('listDeals', L, 3)
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(more).toEqual([true, true, false])
    expect(sent.map((u) => u.pathname)).toEqual(Array(3).fill('/api/v2/orders'))
    expect(
      sent.every((u) => u.searchParams.getAll('probability').join('&') === 'gte:1&lte:99'),
    ).toBe(true)
  })

  it('listActivities serves every task once over 3 pages', async () => {
    const { sent } = fakeUpsales({ activities: rows(N, () => ({ description: 'Call' })) })
    const { seen, more } = await walk('listActivities', L, 3)
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(more).toEqual([true, true, false])
    expect(sent.map((u) => u.pathname)).toEqual(Array(3).fill('/api/v2/activities/'))
  })

  it('a page past the end is empty with hasMore false', async () => {
    fakeUpsales({ contacts: rows(N) })
    const params = withPageSink({ page: 4, limit: L })
    expect(await new UpsalesAdapter().listContacts(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an exact multiple of the page size ends on the last full page', async () => {
    fakeUpsales({ contacts: rows(2 * L) })
    const { seen, more } = await walk('listContacts', L, 2)
    expect(seen).toEqual(['1', '2', '3', '4'])
    expect(more).toEqual([true, false])
  })

  it('clamps a limit above the documented 2000 and reports the size sent', async () => {
    const { sent } = fakeUpsales({ contacts: rows(MAX + 1) })
    const adapter = new UpsalesAdapter()
    const p1 = withPageSink({ page: 1, limit: 5000 })
    const first = await adapter.listContacts(CREDS, p1)
    expect(first).toHaveLength(MAX)
    expect(sent[0]!.searchParams.get('limit')).toBe(String(MAX))
    expect(readUpstreamPage(p1)).toMatchObject({
      pageSize: MAX,
      hasMore: true,
      totalCount: MAX + 1,
    })

    const p2 = withPageSink({ page: 2, limit: 5000 })
    const second = await adapter.listContacts(CREDS, p2)
    expect(sent[1]!.searchParams.get('offset')).toBe(String(MAX))
    expect(second.map((c) => c.id)).toEqual([String(MAX + 1)])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('sends the documented default of 1000 when the caller gives no limit', async () => {
    const { sent } = fakeUpsales({ contacts: rows(3) })
    await new UpsalesAdapter().listContacts(CREDS, withPageSink({ page: 1 }))
    expect(sent[0]!.searchParams.get('limit')).toBe('1000')
    expect(sent[0]!.searchParams.get('offset')).toBe('0')
  })

  it('sends the documented "content-type: application/json" header', async () => {
    fakeUpsales({ contacts: rows(1) })
    await new UpsalesAdapter().listContacts(CREDS, withPageSink({ page: 1, limit: 1 }))
    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1]
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
  })

  it('declares the documented maximum', () => {
    expect(new UpsalesAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeUpsales({ contacts: rows(3) })
    const adapter = new UpsalesAdapter()
    const p1 = parseListQuery({ page: '1', limit: '2' })
    const env1 = listPage(await adapter.listContacts(CREDS, p1), p1, 'upsales')
    expect(env1.data.map((c) => c.id)).toEqual(['1', '2'])
    expect(env1.meta.hasMore).toBe(true)
    const p2 = parseListQuery({ page: '2', limit: '2' })
    const env2 = listPage(await adapter.listContacts(CREDS, p2), p2, 'upsales')
    expect(env2.data.map((c) => c.id)).toEqual(['3'])
    expect(env2.meta.hasMore).toBe(false)
  })
})

describe('upsales listPipelines (every /orderstages row folded into one pipeline)', () => {
  it('drains every stage at the documented maximum and serves one pipeline once', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakeUpsales({
      orderstages: rows(total, (id) => ({ name: `S${id}`, probability: 50 })),
    })
    const adapter = new UpsalesAdapter()
    const p1 = withPageSink({ page: 1, limit: 1 })
    const first = await adapter.listPipelines(CREDS, p1)
    expect(sent.map((u) => u.pathname)).toEqual(Array(3).fill('/api/v2/orderstages'))
    expect(sent.map((u) => u.searchParams.get('offset'))).toEqual([
      '0',
      String(MAX),
      String(2 * MAX),
    ])
    expect(sent.map((u) => u.searchParams.get('limit'))).toEqual(Array(3).fill(String(MAX)))
    expect(first).toHaveLength(1)
    expect(first[0]!.stages?.map((s) => s.id)).toEqual(
      Array.from({ length: total }, (_, i) => String(i + 1)),
    )
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)

    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listPipelines(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('stops after one request when metadata.total is reached', async () => {
    const { sent } = fakeUpsales({ orderstages: rows(6, (id) => ({ name: `S${id}` })) })
    const got = await new UpsalesAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(sent).toHaveLength(1)
    expect(got[0]!.stages).toHaveLength(6)
  })

  it('throws on a full /orderstages page without metadata.total instead of truncating', async () => {
    const sent: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      sent.push(String(input))
      const data = Array.from({ length: MAX }, (_, i) => ({ id: i + 1, name: `S${i + 1}` }))
      return json({ error: null, data })
    })
    await expect(
      new UpsalesAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/metadata\.total/)
    expect(sent).toHaveLength(1)
  })

  it('returns no pipeline when the account has no stages', async () => {
    fakeUpsales({ orderstages: [] })
    expect(
      await new UpsalesAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).toEqual([])
  })
})

describe('upsales get* read back the ids the lists return', () => {
  it('getContact → GET /contacts/{id}', async () => {
    const { sent } = fakeUpsales({ contacts: [{ id: 3, name: 'Richard Hendricks' }] })
    expect((await new UpsalesAdapter().getContact(CREDS, '3')).name).toBe('Richard Hendricks')
    expect(sent[0]!.pathname).toBe('/api/v2/contacts/3')
  })

  it('getCompany → GET /accounts/{id}', async () => {
    const { sent } = fakeUpsales({ accounts: [{ id: 2, name: 'Salesboard' }] })
    expect((await new UpsalesAdapter().getCompany(CREDS, '2')).name).toBe('Salesboard')
    expect(sent[0]!.pathname).toBe('/api/v2/accounts/2')
  })

  it('getDeal → GET /orders/{id}', async () => {
    const { sent } = fakeUpsales({ orders: [{ id: 2, description: 'Example', probability: 25 }] })
    expect((await new UpsalesAdapter().getDeal(CREDS, '2')).title).toBe('Example')
    expect(sent[0]!.pathname).toBe('/api/v2/orders/2')
  })

  it('getActivity → GET /activities/{id}', async () => {
    const { sent } = fakeUpsales({ activities: [{ id: 1, description: 'Call' }] })
    expect((await new UpsalesAdapter().getActivity(CREDS, '1')).subject).toBe('Call')
    expect(sent[0]!.pathname).toBe('/api/v2/activities/1')
  })
})
