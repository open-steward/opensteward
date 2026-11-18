import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type {
  Credentials,
  QueryParams,
} from '../../../../../../src/verticals/crm/adapter/interface'
import { PipedriveAdapter } from '../../../../../../src/verticals/crm/adapters/pipedrive/index'

/**
 * Pipedrive API v2 lists (https://developers.pipedrive.com/docs/api/v2/openapi.yaml).
 *
 * The v1 list endpoints the adapter called are out of support: "The API v1
 * endpoints announced for deprecation in one of our previous changelog are now
 * in an out-of-support state." The changelog maps GET /v1/persons,
 * /v1/organizations, /v1/deals, /v1/activities, /v1/pipelines and /v1/stages
 * (and their /{id} reads) to /api/v2/... equivalents
 * (https://developers.pipedrive.com/changelog/post/deprecated-apiv1-endpoints-become-out-of-support).
 *
 * The fake honours only what the v2 spec documents for these lists:
 *   limit  — "If not provided, 100 items will be returned. Please note that a
 *            maximum value of 500 is allowed."
 *   cursor — "the marker (an opaque string value) representing the first item
 *            on the next page"
 *   additional_data.next_cursor — "will be `null` if you have reached the end
 *            of the dataset"
 *   updated_since (persons, organizations, deals, activities) — "only ... with
 *            an `update_time` later than or equal to this time are returned"
 *   pipeline_id (stages) — "If omitted, stages for all pipelines will be fetched."
 *   sort_by (stages) — "The field to sort by. Supported fields: `id`,
 *            `update_time`, `add_time`, `order_nr`." (default `id`, ascending)
 * Anything else in the query string is recorded and fails the test.
 */

const DEFAULT = 100
const MAX = 500
const creds: Credentials = { accessToken: 'oauth-tok', refreshToken: 'refresh-tok' }

interface Row {
  id: number
  update_time: string
  pipeline_id?: number
  [k: string]: unknown
}

const DOCUMENTED: Record<string, string[]> = {
  persons: ['limit', 'cursor', 'updated_since'],
  organizations: ['limit', 'cursor', 'updated_since'],
  deals: ['limit', 'cursor', 'updated_since'],
  activities: ['limit', 'cursor', 'updated_since'],
  pipelines: ['limit', 'cursor'],
  stages: ['limit', 'cursor', 'pipeline_id', 'sort_by'],
}

let requests: Request[] = []
let collections: Record<string, Row[]> = {}
let undocumented: string[] = []

/** Opaque, and bound to the filter it was minted under, as a real cursor is. */
function encodeCursor(offset: number, since: string | null = null): string {
  return Buffer.from(JSON.stringify({ o: offset, s: since })).toString('base64url')
}
function decodeCursor(c: string): { o: number; s: string | null } {
  return JSON.parse(Buffer.from(c, 'base64url').toString()) as { o: number; s: string | null }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function serve(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const req = new Request(input, init)
      requests.push(req)
      const url = new URL(req.url)
      const m =
        /^\/api\/v2\/(persons|organizations|deals|activities|pipelines|stages)(?:\/(\d+))?$/.exec(
          url.pathname,
        )
      if (!m) return json({ success: false, error: 'not found' }, 404)
      const [, resource, id] = m
      const rows = collections[resource!] ?? []
      if (id !== undefined) {
        const row = rows.find((r) => r.id === Number(id))
        return row ? json({ success: true, data: row }) : json({ success: false }, 404)
      }
      for (const k of url.searchParams.keys()) {
        if (!DOCUMENTED[resource!]!.includes(k)) undocumented.push(`${resource}:${k}`)
      }
      let filtered = rows
      const since = url.searchParams.get('updated_since')
      if (since) filtered = filtered.filter((r) => Date.parse(r.update_time) >= Date.parse(since))
      const pipelineId = url.searchParams.get('pipeline_id')
      if (pipelineId) filtered = filtered.filter((r) => r.pipeline_id === Number(pipelineId))
      const sortBy = url.searchParams.get('sort_by')
      if (sortBy && !['id', 'update_time', 'add_time', 'order_nr'].includes(sortBy))
        return json({ success: false, error: 'bad sort_by' }, 400)
      if (sortBy === 'order_nr') {
        filtered = [...filtered].sort(
          (a, b) => Number(a.order_nr) - Number(b.order_nr) || a.id - b.id,
        )
      }
      const rawLimit = url.searchParams.get('limit')
      const limit = rawLimit === null ? DEFAULT : Number(rawLimit)
      if (limit > MAX) return json({ success: false, error: 'limit too large' }, 400)
      const cursor = url.searchParams.get('cursor')
      const decoded = cursor ? decodeCursor(cursor) : { o: 0, s: since }
      if (decoded.s !== since)
        return json({ success: false, error: 'cursor minted under another filter' }, 400)
      const start = decoded.o
      const page = filtered.slice(start, start + limit)
      const end = start + page.length >= filtered.length
      return json({
        success: true,
        data: page,
        additional_data: { next_cursor: end ? null : encodeCursor(start + page.length, since) },
      })
    }),
  )
}

function rows(n: number, extra: (i: number) => Record<string, unknown> = () => ({})): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    update_time: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    add_time: '2026-01-01T00:00:00Z',
    ...extra(i),
  }))
}

beforeEach(() => {
  requests = []
  collections = {}
  undocumented = []
  _resetCursorPager()
  serve()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

type ListName = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listPipelines'
const LISTS: Array<{
  method: ListName
  resource: string
  extra: (i: number) => Record<string, unknown>
}> = [
  { method: 'listContacts', resource: 'persons', extra: (i) => ({ name: `P${i + 1}` }) },
  { method: 'listCompanies', resource: 'organizations', extra: (i) => ({ name: `O${i + 1}` }) },
  { method: 'listDeals', resource: 'deals', extra: (i) => ({ title: `D${i + 1}` }) },
  { method: 'listActivities', resource: 'activities', extra: () => ({}) },
  { method: 'listPipelines', resource: 'pipelines', extra: (i) => ({ name: `Pl${i + 1}` }) },
]

function call(method: ListName, params: QueryParams, adapter = new PipedriveAdapter()) {
  return (adapter[method] as (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>)(
    creds,
    params,
  )
}

describe.each(LISTS)(
  'pipedrive $method on GET /api/v2/$resource',
  ({ method, resource, extra }) => {
    it('walks 2L+1 rows over pages 1..3: every id once, in order, hasMore exact', async () => {
      const L = 3
      collections[resource] = rows(2 * L + 1, extra)
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const out = await call(method, params)
        seen.push(...out.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
      expect(hasMore).toEqual([true, true, false])
      expect(undocumented).toEqual([])
    })

    it('sends the caller limit and the cursor from the previous page', async () => {
      collections[resource] = rows(7, extra)
      await call(method, withPageSink({ page: 1, limit: 3 }))
      await call(method, withPageSink({ page: 2, limit: 3 }))
      const own = requests
        .map((r) => new URL(r.url))
        .filter((u) => u.pathname === `/api/v2/${resource}`)
      expect(own[0]!.searchParams.get('limit')).toBe('3')
      expect(own[0]!.searchParams.has('cursor')).toBe(false)
      expect(own[1]!.searchParams.get('limit')).toBe('3')
      expect(own[1]!.searchParams.get('cursor')).toBe(encodeCursor(3))
    })

    it('reaches page 3 cold by walking the cursor chain', async () => {
      collections[resource] = rows(7, extra)
      const params = withPageSink({ page: 3, limit: 3 })
      const out = await call(method, params)
      expect(out.map((r) => r.id)).toEqual(['7'])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('ends on an exact multiple of limit with hasMore false', async () => {
      collections[resource] = rows(6, extra)
      const params = withPageSink({ page: 2, limit: 3 })
      expect((await call(method, params)).map((r) => r.id)).toEqual(['4', '5', '6'])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('clamps a limit above 500, reports pageSize 500, and still serves every row', async () => {
      const N = 2 * MAX + 5
      collections[resource] = rows(N, extra)
      const seen: string[] = []
      for (let page = 1; page <= 5; page++) {
        const params = withPageSink({ page, limit: 800 })
        seen.push(...(await call(method, params)).map((r) => r.id))
        expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
        if (readUpstreamPage(params)?.hasMore === false) break
      }
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
      const own = requests
        .map((r) => new URL(r.url))
        .filter((u) => u.pathname === `/api/v2/${resource}`)
      expect(own.every((u) => u.searchParams.get('limit') === String(MAX))).toBe(true)
    })

    it('does not report pageSize when the limit is within the maximum', async () => {
      collections[resource] = rows(2, extra)
      const params = withPageSink({ page: 1, limit: 50 })
      await call(method, params)
      expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
    })

    it('sends the documented default of 100 when the caller names no limit', async () => {
      collections[resource] = rows(1, extra)
      await call(method, withPageSink({}))
      const own = requests
        .map((r) => new URL(r.url))
        .find((u) => u.pathname === `/api/v2/${resource}`)
      expect(own!.searchParams.get('limit')).toBe('100')
    })

    it('sends an OAuth token as Authorization: Bearer, never as an api_token query parameter', async () => {
      collections[resource] = rows(1, extra)
      await call(method, withPageSink({ page: 1, limit: 1 }))
      for (const r of requests) {
        expect(r.headers.get('authorization')).toBe('Bearer oauth-tok')
        expect(r.headers.get('x-api-token')).toBeNull()
        expect(new URL(r.url).searchParams.has('api_token')).toBe(false)
        expect(new URL(r.url).origin).toBe('https://api.pipedrive.com')
      }
    })

    it('does not forward undocumented params such as search, start or cursor', async () => {
      collections[resource] = rows(1, extra)
      await call(method, withPageSink({ page: 1, limit: 1, search: 'x', start: 5, cursor: 'zzz' }))
      expect(undocumented).toEqual([])
      const own = requests
        .map((r) => new URL(r.url))
        .find((u) => u.pathname === `/api/v2/${resource}`)
      expect(own!.searchParams.has('cursor')).toBe(false)
    })
  },
)

describe.each(LISTS.filter((l) => l.method !== 'listPipelines'))(
  'pipedrive $method updatedAfter',
  ({ method, resource, extra }) => {
    it('sends updatedAfter as updated_since in RFC 3339 and pages the filtered set', async () => {
      collections[resource] = rows(10, extra)
      const updatedAfter = new Date('2026-01-05T00:00:00.000Z')
      const seen: string[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: 3, updatedAfter })
        seen.push(...(await call(method, params)).map((r) => r.id))
        if (readUpstreamPage(params)?.hasMore === false) break
      }
      expect(seen).toEqual(['5', '6', '7', '8', '9', '10'])
      const sent = requests.map((r) => new URL(r.url).searchParams.get('updated_since'))
      expect(sent.every((s) => s === '2026-01-05T00:00:00Z')).toBe(true)
    })

    it('does not reuse the cursors of an unfiltered walk for a filtered call', async () => {
      collections[resource] = rows(10, extra)
      await call(method, withPageSink({ page: 1, limit: 3 }))
      const params = withPageSink({
        page: 2,
        limit: 3,
        updatedAfter: new Date('2026-01-05T00:00:00Z'),
      })
      const out = await call(method, params)
      expect(out.map((r) => r.id)).toEqual(['8', '9', '10'])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })
  },
)

describe('pipedrive listPipelines stages', () => {
  it('attaches each pipeline its own stages, walking every page of /api/v2/stages', async () => {
    collections.pipelines = rows(3, (i) => ({ name: `Pl${i + 1}`, is_deleted: false }))
    // 1,203 stages: three /stages pages at the 500 maximum, uneven last page.
    collections.stages = rows(1203, (i) => ({ name: `S${i + 1}`, pipeline_id: (i % 3) + 1 }))
    const params = withPageSink({ page: 1, limit: 2 })
    const out = await new PipedriveAdapter().listPipelines(creds, params)
    expect(out.map((p) => p.id)).toEqual(['1', '2'])
    expect(out[0]!.stages).toHaveLength(401)
    expect(out[1]!.stages).toHaveLength(401)
    expect(out[0]!.stages!.every((s) => (Number(s.id) - 1) % 3 === 0)).toBe(true)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const stageCalls = requests
      .map((r) => new URL(r.url))
      .filter((u) => u.pathname === '/api/v2/stages')
    expect(stageCalls).toHaveLength(3)
    expect(stageCalls.every((u) => u.searchParams.get('limit') === '500')).toBe(true)
    expect(stageCalls.map((u) => u.searchParams.has('cursor'))).toEqual([false, true, true])
    expect(undocumented).toEqual([])
  })

  it('asks for stages by order_nr, so each pipeline lists them in stage order across pages', async () => {
    collections.pipelines = rows(1, () => ({ name: 'Pl1' }))
    // order_nr runs opposite to id, over two /stages pages.
    collections.stages = rows(600, (i) => ({
      name: `S${i + 1}`,
      pipeline_id: 1,
      order_nr: 600 - i,
    }))
    const out = await new PipedriveAdapter().listPipelines(
      creds,
      withPageSink({ page: 1, limit: 1 }),
    )
    const orders = out[0]!.stages!.map((s) => s.order!)
    expect(orders).toHaveLength(600)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    const stageCalls = requests
      .map((r) => new URL(r.url))
      .filter((u) => u.pathname === '/api/v2/stages')
    expect(stageCalls.every((u) => u.searchParams.get('sort_by') === 'order_nr')).toBe(true)
    expect(undocumented).toEqual([])
  })

  it('stops with an error when /stages hands back a cursor it already returned', async () => {
    collections.pipelines = rows(1)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const req = new Request(input, init)
        requests.push(req)
        const path = new URL(req.url).pathname
        if (path === '/api/v2/pipelines')
          return json({ success: true, data: rows(1), additional_data: { next_cursor: null } })
        // Repeats its cursor, then ends after 5 calls so a missing guard fails
        // the assertions below instead of looping forever.
        const calls = requests.filter((r) => new URL(r.url).pathname === path).length
        return json({
          success: true,
          data: [{ id: requests.length, name: 's', pipeline_id: 1 }],
          additional_data: { next_cursor: calls >= 5 ? null : 'same' },
        })
      }),
    )
    await expect(
      new PipedriveAdapter().listPipelines(creds, withPageSink({ page: 1, limit: 1 })),
    ).rejects.toThrow(/already returned/)
    // The first page, then one follow with the cursor, then the repeat is caught.
    expect(requests.filter((r) => new URL(r.url).pathname === '/api/v2/stages')).toHaveLength(2)
  })

  it('fetches no stages for a page past the end', async () => {
    collections.pipelines = rows(1)
    collections.stages = rows(2, () => ({ pipeline_id: 1 }))
    const params = withPageSink({ page: 2, limit: 1 })
    expect(await new PipedriveAdapter().listPipelines(creds, params)).toEqual([])
    expect(requests.some((r) => new URL(r.url).pathname === '/api/v2/stages')).toBe(false)
  })
})

describe('pipedrive get* on API v2', () => {
  beforeEach(() => {
    collections.persons = [{ id: 42, update_time: '2026-01-01T00:00:00Z', name: 'Jane' }]
    collections.organizations = [{ id: 43, update_time: '2026-01-01T00:00:00Z', name: 'Acme' }]
    collections.deals = [
      { id: 44, update_time: '2026-01-01T00:00:00Z', title: 'Big', value: 10, currency: 'EUR' },
    ]
    collections.activities = [{ id: 45, update_time: '2026-01-01T00:00:00Z', subject: 'Call' }]
    collections.pipelines = [{ id: 46, update_time: '2026-01-01T00:00:00Z', name: 'Sales' }]
    collections.stages = [
      ...rows(501, () => ({ pipeline_id: 46, name: 's' })),
      { id: 9999, update_time: '2026-01-01T00:00:00Z', pipeline_id: 1, name: 'other' },
    ]
  })

  it('reads each resource from its /api/v2/{resource}/{id} path', async () => {
    const a = new PipedriveAdapter()
    expect((await a.getContact(creds, '42')).name).toBe('Jane')
    expect((await a.getCompany(creds, '43')).name).toBe('Acme')
    expect((await a.getDeal(creds, '44')).value).toEqual({ amount: 10, currency: 'EUR' })
    expect((await a.getActivity(creds, '45')).subject).toBe('Call')
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/api/v2/persons/42',
      '/api/v2/organizations/43',
      '/api/v2/deals/44',
      '/api/v2/activities/45',
    ])
  })

  it('getPipeline reads /api/v2/pipelines/{id} and every page of its stages by pipeline_id', async () => {
    const p = await new PipedriveAdapter().getPipeline(creds, '46')
    expect(p.name).toBe('Sales')
    expect(p.stages).toHaveLength(501)
    const stageCalls = requests
      .map((r) => new URL(r.url))
      .filter((u) => u.pathname === '/api/v2/stages')
    expect(stageCalls).toHaveLength(2)
    expect(stageCalls.every((u) => u.searchParams.get('pipeline_id') === '46')).toBe(true)
  })

  it('answers 404 for an id the platform does not have', async () => {
    await expect(new PipedriveAdapter().getContact(creds, '7')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('answers 404 when a 200 carries no data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ success: true, data: null })),
    )
    await expect(new PipedriveAdapter().getDeal(creds, '44')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('pipedrive auth and host', () => {
  it('sends a configured static API token in the x-api-token header', async () => {
    collections.persons = rows(1)
    await new PipedriveAdapter({ apiToken: 'static-tok' }).listContacts(
      creds,
      withPageSink({ page: 1, limit: 1 }),
    )
    const r = requests[0]!
    expect(r.headers.get('x-api-token')).toBe('static-tok')
    expect(r.headers.get('authorization')).toBeNull()
    expect(new URL(r.url).searchParams.has('api_token')).toBe(false)
  })

  it('sends requests to the api_domain the connection recorded', async () => {
    collections.persons = rows(1)
    await new PipedriveAdapter().listContacts(
      { ...creds, extra: { apiDomain: 'https://acme.pipedrive.com' } },
      withPageSink({ page: 1, limit: 1 }),
    )
    expect(new URL(requests[0]!.url).origin).toBe('https://acme.pipedrive.com')
  })

  it('uses only the origin of an api_domain that carries a trailing slash or a path', async () => {
    collections.persons = rows(1)
    for (const apiDomain of ['https://acme.pipedrive.com/', 'https://acme.pipedrive.com/v1']) {
      requests = []
      _resetCursorPager()
      await new PipedriveAdapter().listContacts(
        { ...creds, extra: { apiDomain } },
        withPageSink({ page: 1, limit: 1 }),
      )
      expect(requests[0]!.url.startsWith('https://acme.pipedrive.com/api/v2/persons?')).toBe(true)
    }
  })

  it('sends the documented default of 100 for a limit below 1', async () => {
    collections.persons = rows(1)
    await new PipedriveAdapter().listContacts(creds, withPageSink({ page: 1, limit: 0 }))
    expect(new URL(requests[0]!.url).searchParams.get('limit')).toBe('100')
  })

  it('refuses a non-https api_domain before sending anything', async () => {
    await expect(
      new PipedriveAdapter().listContacts(
        { ...creds, extra: { apiDomain: 'http://acme.pipedrive.com' } },
        withPageSink({ page: 1, limit: 1 }),
      ),
    ).rejects.toThrow(/https/)
    expect(requests).toHaveLength(0)
  })

  it('records api_domain from the token exchange and the refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          access_token: 'a2',
          token_type: 'bearer',
          refresh_token: 'r2',
          scope: 'base',
          expires_in: 3599,
          api_domain: 'https://acme.pipedrive.com',
        }),
      ),
    )
    const adapter = new PipedriveAdapter({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://x/cb',
    })
    const exchanged = await adapter.exchangeCode('code', 'https://x/cb')
    expect(exchanged.extra).toEqual({ apiDomain: 'https://acme.pipedrive.com' })
    const refreshed = await adapter.refreshCredentials({
      accessToken: 'a1',
      refreshToken: 'r1',
      extra: { other: 1 },
    })
    expect(refreshed.extra).toEqual({ other: 1, apiDomain: 'https://acme.pipedrive.com' })
  })
})
