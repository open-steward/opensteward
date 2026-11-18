import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { RaynetAdapter } from '../../../../../../src/verticals/crm/adapters/raynet/index'
import { COMPANY, DEAL, DEAL_PHASE, DEAL_TYPE, PERSON, TASK } from './fixtures'

/**
 * Raynet CRM REST API v2, from the OpenAPI 3.0.3 spec embedded in
 * https://app.raynetcrm.com/api/doc/index-en.html:
 *   - auth: basic `user:api-key` plus `X-Instance-Name`;
 *   - lists GET /person/, /company/, /businessCase/, /task/ take `offset` and
 *     `limit` ("The maximum page size is 1 000 items") and answer
 *     `{ success, totalCount, data }`;
 *   - picklists GET /businessCaseType/ and /businessCasePhase/ take only
 *     `rowAccess` and answer the same envelope, whole;
 *   - `dateFormat=ISO8601` switches timestamps to ISO 8601;
 *   - the lists also document `sortColumn` (enum includes "id") and
 *     `sortDirection` (["ASC", "DESC"]), and state no default order.
 * The fake below honours exactly those parameters and rejects any other. With
 * no sort requested it answers in an order that differs between calls, since
 * the docs promise none.
 */

const BASE = 'https://app.raynetcrm.com/api/v2'
const creds = { accessToken: 'api-key', extra: { username: 'user', instanceName: 'my-crm' } }

const LIST_PARAMS = new Set(['offset', 'limit', 'dateFormat', 'sortColumn', 'sortDirection'])
const PICKLIST_PARAMS = new Set(['rowAccess'])

let requests: { url: URL; headers: Record<string, string> }[] = []

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface Collections {
  person?: unknown[]
  company?: unknown[]
  businessCase?: unknown[]
  task?: unknown[]
  businessCaseType?: unknown[]
  businessCasePhase?: unknown[]
}

function serve(cols: Collections) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      const headers = init.headers as Record<string, string>
      requests.push({ url, headers })
      if (!url.href.startsWith(`${BASE}/`)) return json({ success: false }, 404)
      if (headers['X-Instance-Name'] !== 'my-crm') return json({ success: false }, 401)
      if (headers['Authorization'] !== `Basic ${Buffer.from('user:api-key').toString('base64')}`) {
        return json({ success: false }, 401)
      }
      const path = url.pathname.slice('/api/v2'.length)
      const picklist = /^\/(businessCaseType|businessCasePhase)\/$/.exec(path)
      if (picklist) {
        for (const k of url.searchParams.keys())
          if (!PICKLIST_PARAMS.has(k)) return json({ success: false }, 400)
        const rows = cols[picklist[1] as keyof Collections] ?? []
        return json({ success: 'true', totalCount: rows.length, data: rows })
      }
      const list = /^\/(person|company|businessCase|task)\/$/.exec(path)
      if (list) {
        for (const k of url.searchParams.keys())
          if (!LIST_PARAMS.has(k)) return json({ success: false }, 400)
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit'))
        if (!(limit >= 1 && limit <= 1000)) return json({ success: false }, 400)
        let rows = [...((cols[list[1] as keyof Collections] ?? []) as { id: number }[])]
        const sortColumn = url.searchParams.get('sortColumn')
        const sortDirection = url.searchParams.get('sortDirection') ?? 'ASC'
        if (sortColumn === 'id') {
          rows.sort((a, b) => (sortDirection === 'DESC' ? b.id - a.id : a.id - b.id))
        } else if (sortColumn === null) {
          // Unspecified order: rotate by the number of calls so far.
          const k = requests.length % Math.max(rows.length, 1)
          rows = [...rows.slice(k), ...rows.slice(0, k)]
        } else {
          return json({ success: false }, 400)
        }
        return json({
          success: 'true',
          totalCount: rows.length,
          data: rows.slice(offset, offset + limit),
        })
      }
      const detail = /^\/(person|company|businessCase|task)\/(\d+)\/$/.exec(path)
      if (detail) {
        for (const k of url.searchParams.keys())
          if (k !== 'dateFormat') return json({ success: false }, 400)
        const rows = (cols[detail[1] as keyof Collections] ?? []) as { id: number }[]
        const row = rows.find((r) => String(r.id) === detail[2])
        return row ? json({ success: 'true', data: row }) : json({ success: false }, 404)
      }
      return json({ success: false }, 404)
    }),
  )
}

function many<T extends { id: number }>(base: T, n: number): T[] {
  return Array.from({ length: n }, (_, i) => ({ ...base, id: i + 1 }))
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new RaynetAdapter()

describe('raynet auth', () => {
  it('sends basic user:api-key and X-Instance-Name, never the old X-User/X-ApiKey headers', async () => {
    serve({ person: [PERSON] })
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 10 }))
    expect(requests).toHaveLength(1)
    const h = requests[0]!.headers
    expect(h['Authorization']).toBe(`Basic ${Buffer.from('user:api-key').toString('base64')}`)
    expect(h['X-Instance-Name']).toBe('my-crm')
    expect(h).not.toHaveProperty('X-User')
    expect(h).not.toHaveProperty('X-ApiKey')
  })

  it('refuses a connection without a username, API key or instance name before sending anything', async () => {
    serve({ person: [PERSON] })
    for (const bad of [
      { accessToken: 'api-key' },
      { accessToken: 'api-key', extra: { username: 'user' } },
      { accessToken: 'api-key', extra: { instanceName: 'my-crm' } },
      { accessToken: '', extra: { username: 'user', instanceName: 'my-crm' } },
    ]) {
      await expect(
        adapter.listContacts(bad, withPageSink({ page: 1, limit: 10 })),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'RECONNECT_REQUIRED',
      })
    }
    expect(requests).toHaveLength(0)
  })

  it('collects username, API key and instance name at connect time', async () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual([
      'username',
      'apiKey',
      'instanceName',
    ])
    await expect(
      adapter.exchangeCredentials({
        username: ' user ',
        apiKey: 'api-key',
        instanceName: 'my-crm',
      }),
    ).resolves.toEqual(creds)
    await expect(
      adapter.exchangeCredentials({ username: 'user', apiKey: 'api-key' }),
    ).rejects.toThrow(/Instance name/)
  })
})

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'
const LISTS: [ListMethod, keyof Collections, { id: number }][] = [
  ['listContacts', 'person', PERSON],
  ['listCompanies', 'company', COMPANY],
  ['listDeals', 'businessCase', DEAL],
  ['listActivities', 'task', TASK],
]

describe.each(LISTS)('raynet %s', (method, collection, row) => {
  it(`calls GET /${collection}/ with offset, limit, an id sort and dateFormat=ISO8601 only`, async () => {
    serve({ [collection]: many(row, 7) })
    await adapter[method](creds, withPageSink({ page: 3, limit: 3 }))
    expect(requests).toHaveLength(1)
    const u = requests[0]!.url
    expect(u.pathname).toBe(`/api/v2/${collection}/`)
    expect(Object.fromEntries(u.searchParams)).toEqual({
      offset: '6',
      limit: '3',
      sortColumn: 'id',
      sortDirection: 'ASC',
      dateFormat: 'ISO8601',
    })
  })

  it('walks 2L+1 rows over pages 1..3: every id once, exact hasMore from totalCount', async () => {
    const L = 3
    serve({ [collection]: many(row, 2 * L + 1) })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const out = await adapter[method](creds, params)
      seen.push(...out.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('ends on totalCount when the total is an exact multiple of the page size', async () => {
    serve({ [collection]: many(row, 6) })
    const params = withPageSink({ page: 2, limit: 3 })
    const out = await adapter[method](creds, params)
    expect(out.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps a direct call past 1000 to the documented maximum and reports the size sent', async () => {
    serve({ [collection]: many(row, 1001) })
    const params = withPageSink({ page: 2, limit: 5000 })
    const out = await adapter[method](creds, params)
    expect(requests[0]!.url.searchParams.get('limit')).toBe('1000')
    expect(requests[0]!.url.searchParams.get('offset')).toBe('1000')
    expect(out.map((r) => r.id)).toEqual(['1001'])
    expect(readUpstreamPage(params)).toMatchObject({
      pageSize: 1000,
      hasMore: false,
      totalCount: 1001,
    })
  })
})

describe('raynet get* read back the ids the lists return', () => {
  it.each([
    ['getContact', 'person', PERSON],
    ['getCompany', 'company', COMPANY],
    ['getDeal', 'businessCase', DEAL],
    ['getActivity', 'task', TASK],
  ] as const)('%s calls GET /%s/{id}/', async (method, collection, row) => {
    serve({ [collection]: [row] })
    const out = await adapter[method](creds, String(row.id))
    expect(out.id).toBe(String(row.id))
    expect(requests[0]!.url.pathname).toBe(`/api/v2/${collection}/${row.id}/`)
    expect(requests[0]!.url.searchParams.get('dateFormat')).toBe('ISO8601')
  })
})

describe('raynet listPipelines', () => {
  function types(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      ...DEAL_TYPE,
      id: i + 1,
      code01: `Type ${i + 1}`,
      sequenceNumber: i + 1,
    }))
  }

  it('reads the two documented picklists with no parameters and groups phases under their type', async () => {
    serve({
      businessCaseType: [DEAL_TYPE],
      businessCasePhase: [
        { ...DEAL_PHASE, id: 7, businessCaseTypeId: 3, sequenceNumber: 2, code01: 'Offer' },
        { ...DEAL_PHASE, id: 8, businessCaseTypeId: 3, sequenceNumber: 1, code01: 'Lead' },
        DEAL_PHASE,
      ],
    })
    const out = await adapter.listPipelines(creds, withPageSink({ page: 1, limit: 10 }))
    expect(requests.map((r) => r.url.pathname).sort()).toEqual([
      '/api/v2/businessCasePhase/',
      '/api/v2/businessCaseType/',
    ])
    for (const r of requests) expect([...r.url.searchParams.keys()]).toEqual([])
    expect(out).toHaveLength(1)
    expect(out[0]!.stages!.map((s) => s.id)).toEqual(['8', '7'])
  })

  it('walks 2L+1 deal types over pages 1..3: every id once, exact hasMore', async () => {
    const L = 3
    serve({ businessCaseType: types(2 * L + 1), businessCasePhase: [] })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const out = await adapter.listPipelines(creds, params)
      seen.push(...out.map((p) => p.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('gives the right meta through parseListQuery then listPage', async () => {
    serve({ businessCaseType: types(7), businessCasePhase: [] })
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await adapter.listPipelines(creds, params), params, 'raynet')
    expect(out.data.map((p) => p.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })

  it('refuses to page locally over a picklist the platform says it truncated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requests.push({ url: new URL(input), headers: {} })
        return json({ success: 'true', totalCount: 5, data: [DEAL_TYPE] })
      }),
    )
    await expect(
      adapter.listPipelines(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})

describe('raynet notes', () => {
  it('listNotes refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    serve({})
    await expect(
      adapter.listNotes(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })

  it('getNote refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    serve({})
    await expect(adapter.getNote(creds, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })
})
