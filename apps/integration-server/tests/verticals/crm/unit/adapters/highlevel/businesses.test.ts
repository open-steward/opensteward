/**
 * HighLevel companies are read from the Businesses API, API Version 2021-07-28.
 *
 * HighLevel's Companies API documents one operation, GET /companies/:companyId
 * ("Get Comapny", sic), under the Agency scope companies.readonly: it returns
 * the agency account, not a sub-account's companies. The adapter used to call
 * an undocumented GET /companies/?locationId=... list.
 *
 * GET /businesses/ "Get Businesses by Location"
 * (https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/businesses/get-businesses-by-location)
 * documents "Query parameters locationId string required limit string Default
 * value: 100 skip string Default value: 0" and a response of `businesses`
 * (object[]), with no total, next marker or stated maximum. GET
 * /businesses/:businessId ("Get Business") returns `{ business }`.
 *
 * The fake below honours only those parameters, at the seam the adapter calls:
 * global `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { HighLevelAdapter } from '../../../../../../src/verticals/crm/adapters/highlevel'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'

const CREDS: Credentials = {
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  extra: { locationId: 'loc-1' },
}

const DOCUMENTED_KEYS = new Set(['locationId', 'limit', 'skip'])

let sent: URL[] = []
let count = 0

const pad = (i: number): string => String(i + 1).padStart(4, '0')
const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `b${pad(i)}`)
const business = (id: string): Record<string, unknown> => ({
  id,
  name: `Business ${id}`,
  locationId: 'loc-1',
  website: `${id}.example`,
  createdAt: '2024-07-29T15:51:28.071Z',
  updatedAt: '2024-07-29T15:51:28.071Z',
})

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** HighLevel's Businesses API as documented, and nothing else. */
async function fakeHighLevel(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  sent.push(url)
  if ((init?.method ?? 'GET') !== 'GET') return json(405, {})
  if (new Headers(init?.headers).get('Version') !== '2021-07-28') return json(400, {})

  if (url.pathname === '/businesses/') {
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED_KEYS.has(k)) return json(422, { message: `undocumented parameter ${k}` })
    }
    if (url.searchParams.get('locationId') !== 'loc-1') return json(422, {})
    const limit = Number(url.searchParams.get('limit') ?? '100')
    const skip = Number(url.searchParams.get('skip') ?? '0')
    return json(200, {
      businesses: ids(count)
        .slice(skip, skip + limit)
        .map(business),
    })
  }

  const one = /^\/businesses\/([^/]+)$/.exec(url.pathname)
  if (one) {
    if ([...url.searchParams.keys()].length > 0) return json(422, {})
    if (!ids(count).includes(one[1]!)) return json(404, {})
    return json(200, { business: business(one[1]!) })
  }

  return json(404, { message: `no route ${url.pathname}` })
}

beforeEach(() => {
  sent = []
  count = 0
  vi.stubGlobal('fetch', vi.fn(fakeHighLevel))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new HighLevelAdapter()

async function syncPage(
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = await adapter.listCompanies(CREDS, params)
  for (const row of rows) CompanySchema.parse(row)
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

describe('highlevel listCompanies reads GET /businesses/', () => {
  it('sends locationId, limit and skip only, to /businesses/', async () => {
    count = 3
    await syncPage(1, 10)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.origin).toBe('https://services.leadconnectorhq.com')
    expect(sent[0]!.pathname).toBe('/businesses/')
    expect(Object.fromEntries(sent[0]!.searchParams)).toEqual({
      locationId: 'loc-1',
      limit: '10',
      skip: '0',
    })
  })

  it('never calls the undocumented /companies/ list', async () => {
    count = 3
    await syncPage(1, 10)
    expect(sent.some((u) => u.pathname.startsWith('/companies'))).toBe(false)
  })

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order', async () => {
    const L = 10
    count = 2 * L + 1
    const all = ids(2 * L + 1)
    const p1 = await syncPage(1, L)
    const p2 = await syncPage(2, L)
    const p3 = await syncPage(3, L)
    expect(p1.ids).toEqual(all.slice(0, 10))
    expect(p2.ids).toEqual(all.slice(10, 20))
    expect(p3.ids).toEqual(all.slice(20))
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(all)
    // HighLevel reports no total or next marker: a full page says nothing, a short page ends it.
    expect(p1.hasMore).toBeUndefined()
    expect(p2.hasMore).toBeUndefined()
    expect(p3.hasMore).toBe(false)
    expect(sent.map((u) => u.searchParams.get('skip'))).toEqual(['0', '10', '20'])
  })

  it('ends on the empty page after rows that end exactly on a page', async () => {
    count = 20
    expect(await syncPage(2, 10)).toEqual({ ids: ids(20).slice(10), hasMore: undefined })
    expect(await syncPage(3, 10)).toEqual({ ids: [], hasMore: false })
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    count = 25
    const params3 = parseListQuery({ limit: '10', page: '3' })
    const env3 = listPage(await adapter.listCompanies(CREDS, params3), params3, 'highlevel')
    expect(env3.data.map((r) => r.id)).toEqual(ids(25).slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('sends the caller limit as is: HighLevel states no maximum', async () => {
    count = 503
    expect((await syncPage(2, 250)).ids).toEqual(ids(503).slice(250, 500))
    expect(sent[0]!.searchParams.get('limit')).toBe('250')
    expect(sent[0]!.searchParams.get('skip')).toBe('250')
  })

  it('serves pages of 25 when the caller sends no limit', async () => {
    count = 60
    const rows = await adapter.listCompanies(CREDS, withPageSink({ page: 2 }))
    expect(rows.map((r) => r.id)).toEqual(ids(60).slice(25, 50))
  })

  it('refuses without a locationId and sends nothing', async () => {
    const creds: Credentials = { accessToken: 'at-1' }
    await expect(adapter.listCompanies(creds, { page: 1, limit: 10 })).rejects.toThrow(/locationId/)
    expect(sent).toHaveLength(0)
  })
})

describe('highlevel getCompany reads GET /businesses/:businessId', () => {
  it('reads back an id the list returned', async () => {
    count = 3
    const [first] = await adapter.listCompanies(CREDS, { page: 1, limit: 10 })
    sent = []
    const company = CompanySchema.parse(await adapter.getCompany(CREDS, first!.id))
    expect(company.id).toBe('b0001')
    expect(company.name).toBe('Business b0001')
    expect(sent.map((u) => u.pathname)).toEqual(['/businesses/b0001'])
  })

  it('reads only the documented `business` key, never a `company` key', async () => {
    // GetBusinessByIdResponseDto documents `business`; the old adapter read
    // `company` from GET /companies/:id. A decoy `company` must be ignored.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        sent.push(new URL(String(input)))
        return json(200, { company: business('decoy'), business: business('b0007') })
      }),
    )
    const company = CompanySchema.parse(await adapter.getCompany(CREDS, 'b0007'))
    expect(company.id).toBe('b0007')
    expect(company.name).toBe('Business b0007')
  })

  it('rejects a response with no `business` key rather than inventing a company', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, {})),
    )
    await expect(adapter.getCompany(CREDS, 'b0007')).rejects.toThrow(/returned no business/)
  })
})

describe('highlevel default OAuth scope', () => {
  // https://marketplace.gohighlevel.com/docs/Authorization/Scopes lists
  // "businesses.readonly GET /businesses Sub-Account" and "companies.readonly
  // GET /companies/ :companyId Agency"; it documents no companies.write.
  it('asks for businesses.readonly, not the Agency-only companies scopes', () => {
    const a = new HighLevelAdapter({ clientId: 'c', redirectUri: 'https://x.example/cb' })
    const scope = new URL(a.getAuthUrl('s')).searchParams.get('scope')!.split(' ')
    expect(scope).toContain('businesses.readonly')
    expect(scope.filter((s) => s.startsWith('companies.'))).toEqual([])
  })
})
