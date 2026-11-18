/**
 * Crelate reads against API v3, from https://app.crelate.com/api3/docs/v3/crelate-openapi.json:
 *
 *   servers: [{ "url": "https://app.crelate.com/api3" }]
 *   "When making HTTP requests, include the API key using the header name `X-Api-Key`."
 *   "All retrieve endpoints that return a list of records support pagination through querystring parameters."
 *   "| offset | number | 0 | Number of records to offset the retrieve by. |"
 *   "| limit | number | 50 | Maximum number of records to retrieve. (Maximum of 100) |"
 *   "If no sort_by is provided, the resulting list will be sorted by ModifiedOn descending."
 *   modified_after: "Contacts that have been modified after this date."
 *   Metadata.MoreRecords: "Whether there are more records in a paged set after the current page."
 *   GET /workflowstatuses workflow_type_ids: "The Workflow type to limit results to.Possible values are: ..."
 *
 * The retired v1 API (/api/pub/v1/...) answers HTTP 410 on every path, so no
 * read may go there.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { CrelateAdapter } from '../../../../../../src/verticals/crm/adapters/crelate/index'
import { WORKFLOW_TYPES } from '../../../../../../src/verticals/crm/adapters/crelate/constants'

const KEY = 'crelate_test_key'
const CREDS = { accessToken: KEY }

interface Row {
  Id: string
  Name: string
  ModifiedOn: string
  WorkflowTypeId?: { Id: string; Title: string }
  SortOrder?: number
}

/** Each list endpoint's documented query parameters (only those this fake honours or tolerates). */
const LIST_PARAMS: Record<string, Set<string>> = {
  contacts: new Set(['limit', 'offset', 'sort_by', 'modified_after']),
  companies: new Set(['limit', 'offset', 'sort_by', 'modified_after']),
  jobs: new Set(['limit', 'offset', 'sort_by', 'modified_after']),
  workflowstatuses: new Set(['limit', 'offset', 'sort_by', 'modified_after', 'workflow_type_ids']),
}

type Sent = { method: string; path: string; query: Record<string, string>; apiKey: string | null }

/**
 * A fake Crelate v3 that honours only documented parameters: `limit` (whole
 * number 1..100, default 50), `offset` (≥ 0, default 0), `sort_by` (only its
 * documented default, `ModifiedOn desc`), `modified_after`, and on
 * /workflowstatuses `workflow_type_ids`. Anything else is a 400; a missing
 * `X-Api-Key` is a 401; a v1 path is a 410.
 */
function fakeCrelate(stores: Record<string, Row[]>) {
  const sent: Sent[] = []
  const envelope = (Data: unknown, Metadata: Record<string, unknown> = {}, status = 200) =>
    new Response(JSON.stringify({ Data, Errors: [], Metadata }), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const query = Object.fromEntries(url.searchParams)
    sent.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      query,
      apiKey: headers.get('X-Api-Key'),
    })
    if (url.pathname.startsWith('/api/pub/v1/'))
      return new Response('{"status":410}', { status: 410 })
    if (url.host !== 'app.crelate.com' || !url.pathname.startsWith('/api3/'))
      return new Response('', { status: 404 })
    if (headers.get('X-Api-Key') !== KEY || url.searchParams.has('api_key'))
      return envelope(null, {}, 401)
    const [entity, id, ...rest] = url.pathname.slice('/api3/'.length).split('/')
    const store = stores[entity!]
    if (!store || rest.length > 0) return new Response('', { status: 404 })
    if (id !== undefined) {
      const row = store.find((r) => r.Id === id)
      return row ? envelope(row) : envelope(null, {}, 404)
    }
    for (const k of Object.keys(query))
      if (!LIST_PARAMS[entity!]!.has(k)) return envelope(null, {}, 400)
    const limit = query.limit === undefined ? 50 : Number(query.limit)
    const offset = query.offset === undefined ? 0 : Number(query.offset)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return envelope(null, {}, 400)
    if (!Number.isInteger(offset) || offset < 0) return envelope(null, {}, 400)
    if (query.sort_by !== undefined && query.sort_by !== 'ModifiedOn desc')
      return envelope(null, {}, 400)
    let rows = [...store].sort(
      (a, b) => b.ModifiedOn.localeCompare(a.ModifiedOn) || a.Id.localeCompare(b.Id),
    )
    if (query.modified_after) rows = rows.filter((r) => r.ModifiedOn > query.modified_after!)
    if (query.workflow_type_ids)
      rows = rows.filter((r) => r.WorkflowTypeId?.Id === query.workflow_type_ids)
    const page = rows.slice(offset, offset + limit)
    return envelope(page, { MoreRecords: offset + limit < rows.length })
  })
  return sent
}

const iso = (i: number) => new Date(Date.UTC(2023, 0, 1) + i * 60_000).toISOString()
const rows = (prefix: string, n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    Id: `${prefix}-${String(i + 1).padStart(4, '0')}`,
    Name: `${prefix} ${i + 1}`,
    ModifiedOn: iso(i),
  }))

afterEach(() => vi.restoreAllMocks())

const LISTS = [
  { method: 'listContacts', entity: 'contacts' },
  { method: 'listCompanies', entity: 'companies' },
  { method: 'listDeals', entity: 'jobs' },
] as const

describe.each(LISTS)('crelate $method → GET /api3/$entity', ({ method, entity }) => {
  it('walks 2L+1 rows at the caller page size: every id once, hasMore exact', async () => {
    const L = 3
    const sent = fakeCrelate({ [entity]: rows(entity, 2 * L + 1) })
    const adapter = new CrelateAdapter()
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const got = await adapter[method](CREDS, params)
      seen.push(...got.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(hasMore).toEqual([true, true, false])
    expect(seen).toHaveLength(2 * L + 1)
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(sent.map((s) => [s.path, s.query.offset, s.query.limit, s.query.sort_by])).toEqual([
      [`/api3/${entity}`, '0', '3', 'ModifiedOn desc'],
      [`/api3/${entity}`, '3', '3', 'ModifiedOn desc'],
      [`/api3/${entity}`, '6', '3', 'ModifiedOn desc'],
    ])
    expect(sent.every((s) => s.apiKey === KEY && !('api_key' in s.query))).toBe(true)
  })

  it('clamps a limit past 100 to 100, strides by it, and reports the size sent', async () => {
    const sent = fakeCrelate({ [entity]: rows(entity, 150) })
    const adapter = new CrelateAdapter()
    const p1 = withPageSink({ page: 1, limit: 250 } as QueryParams)
    const p2 = withPageSink({ page: 2, limit: 250 } as QueryParams)
    const a = await adapter[method](CREDS, p1)
    const b = await adapter[method](CREDS, p2)
    expect(a).toHaveLength(100)
    expect(b).toHaveLength(50)
    expect(new Set([...a, ...b].map((r) => r.id)).size).toBe(150)
    expect(readUpstreamPage(p1)).toMatchObject({ pageSize: 100, hasMore: true })
    expect(readUpstreamPage(p2)).toMatchObject({ pageSize: 100, hasMore: false })
    expect(sent.map((s) => [s.query.offset, s.query.limit])).toEqual([
      ['0', '100'],
      ['100', '100'],
    ])
  })

  it('without a caller limit sends the documented default of 50 and strides by it', async () => {
    const sent = fakeCrelate({ [entity]: rows(entity, 60) })
    const adapter = new CrelateAdapter()
    const p1 = withPageSink({ page: 1 } as QueryParams)
    const p2 = withPageSink({ page: 2 } as QueryParams)
    const a = await adapter[method](CREDS, p1)
    const b = await adapter[method](CREDS, p2)
    expect(a).toHaveLength(50)
    expect(b).toHaveLength(10)
    expect(sent.map((s) => [s.query.offset, s.query.limit])).toEqual([
      ['0', '50'],
      ['50', '50'],
    ])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('sends updatedAfter as modified_after', async () => {
    const sent = fakeCrelate({ [entity]: rows(entity, 10) })
    const got = await new CrelateAdapter()[method](CREDS, {
      page: 1,
      limit: 50,
      updatedAfter: new Date(iso(6)),
    })
    expect(sent[0]!.query.modified_after).toBe(iso(6))
    expect(got.map((r) => r.id).sort()).toEqual([
      `${entity}-0008`,
      `${entity}-0009`,
      `${entity}-0010`,
    ])
  })
})

describe('crelate get* → GET /api3/{entity}/{id}', () => {
  it.each([
    ['getContact', 'contacts'],
    ['getCompany', 'companies'],
    ['getDeal', 'jobs'],
  ] as const)('%s reads the list id back from /api3/%s/{id}', async (method, entity) => {
    const sent = fakeCrelate({ [entity]: rows(entity, 3) })
    const adapter = new CrelateAdapter()
    const got = await adapter[method](CREDS, `${entity}-0002`)
    expect(got.id).toBe(`${entity}-0002`)
    expect(sent).toEqual([
      { method: 'GET', path: `/api3/${entity}/${entity}-0002`, query: {}, apiKey: KEY },
    ])
    await expect(adapter[method](CREDS, 'missing')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a 200 whose Data is null is a 404, not a record', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Data: null, Errors: [], Metadata: {} }), { status: 200 }),
    )
    await expect(new CrelateAdapter().getContact(CREDS, 'c-1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('crelate listPipelines → the documented workflow types + GET /api3/workflowstatuses', () => {
  const statuses = (): Row[] =>
    WORKFLOW_TYPES.flatMap((t, ti) =>
      Array.from({ length: t.Name === 'Sales' ? 150 : 2 }, (_, i) => ({
        Id: `${t.Name}-s${i}`,
        Name: `${t.Name} stage ${i}`,
        SortOrder: i,
        ModifiedOn: iso(ti * 1000 + i),
        WorkflowTypeId: { Id: t.Id, Title: t.Name },
      })),
    )

  it('pages the four types locally, each with every one of its statuses', async () => {
    const sent = fakeCrelate({ workflowstatuses: statuses() })
    const adapter = new CrelateAdapter()
    const p1 = withPageSink({ page: 1, limit: 2 } as QueryParams)
    const p2 = withPageSink({ page: 2, limit: 2 } as QueryParams)
    const first = await adapter.listPipelines(CREDS, p1)
    const second = await adapter.listPipelines(CREDS, p2)
    expect(first.map((p) => p.name)).toEqual(['Recruiting', 'EmploymentSearch'])
    expect(second.map((p) => p.name)).toEqual(['Sales', 'BusinessDevelopment'])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, totalCount: 4, pagedLocally: true })
    expect(readUpstreamPage(p2)).toMatchObject({
      hasMore: false,
      totalCount: 4,
      pagedLocally: true,
    })
    const sales = second[0]!
    expect(sales.id).toBe('56544447-B7A1-40D9-BAAF-A6B000FACCC7')
    expect(sales.stages).toHaveLength(150)
    expect(new Set(sales.stages!.map((s) => s.id)).size).toBe(150)
    expect(sales.stages!.map((s) => s.order)).toEqual(Array.from({ length: 150 }, (_, i) => i))
    expect(first[0]!.stages!.map((s) => s.id)).toEqual(['Recruiting-s0', 'Recruiting-s1'])
    // Sales took two status pages (100 + 50); every other type one.
    expect(
      sent.map((s) => [
        s.path,
        s.query.workflow_type_ids,
        s.query.offset,
        s.query.limit,
        s.query.sort_by,
      ]),
    ).toEqual([
      ['/api3/workflowstatuses', WORKFLOW_TYPES[0]!.Id, '0', '100', 'ModifiedOn desc'],
      ['/api3/workflowstatuses', WORKFLOW_TYPES[1]!.Id, '0', '100', 'ModifiedOn desc'],
      ['/api3/workflowstatuses', WORKFLOW_TYPES[2]!.Id, '0', '100', 'ModifiedOn desc'],
      ['/api3/workflowstatuses', WORKFLOW_TYPES[2]!.Id, '100', '100', 'ModifiedOn desc'],
      ['/api3/workflowstatuses', WORKFLOW_TYPES[3]!.Id, '0', '100', 'ModifiedOn desc'],
    ])
  })

  it('a page past the four types is empty and sends nothing', async () => {
    const sent = fakeCrelate({ workflowstatuses: statuses() })
    const params = withPageSink({ page: 3, limit: 2 } as QueryParams)
    expect(await new CrelateAdapter().listPipelines(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
    expect(sent).toEqual([])
  })

  it('no read goes to the retired v1 API', async () => {
    const sent = fakeCrelate({ workflowstatuses: statuses(), contacts: rows('c', 1) })
    const adapter = new CrelateAdapter()
    await adapter.listPipelines(CREDS, { page: 1, limit: 4 })
    await adapter.listContacts(CREDS, { page: 1, limit: 4 })
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((s) => s.path.startsWith('/api3/'))).toBe(true)
  })
})
