/**
 * Maximizer list/get methods against a fake Octopus API that honours only the
 * documented Read syntax (developer.maximizer.com, fetched 2026-09-25):
 *
 *   read-query-syntax: "// POST https://api.maximizer.com/octopus/Read";
 *     "The authentication token must be passed as a header - "Authorization"
 *     with the specified type `Bearer`."; "A negative Code value indicates that
 *     an error occurred"; "the Data object is nested inside the root-level
 *     entity object".
 *   read-query-syntax-criteria: "The `Top` operator is used to limit the
 *     number of results."
 *   read-query-syntax-orderby: "The `OrderBy` keyword is used to sort the
 *     result-set in ascending or descending order"; Fields is an array of
 *     { "<FieldKey>": "ASC" | "DESC" }.
 *
 * The fake rejects any body key outside that syntax, so a request carrying
 * an invented parameter fails here. It never returns a next PageKey: the docs
 * name no response field for one.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { MaximizerAdapter } from '../../../../../../src/verticals/crm/adapters/maximizer/index'
import {
  documentedCompany,
  documentedContact,
  documentedDeal,
  documentedNote,
  documentedSalesProcess,
  documentedSalesStage,
  documentedTask,
} from './fixtures/documented'

const CREDS = { accessToken: 'pat_test_token' }
const BASE = 'https://api.maximizer.com/octopus'

type Row = Record<string, unknown>
interface Sent {
  url: string
  method: string
  auth: string | null
  body: Record<string, unknown>
}

const OBJECT_KEYS = new Set(['Scope', 'Criteria', 'OrderBy'])
const CRITERIA_KEYS = new Set(['SearchQuery', 'Top'])
const TOP_LEVEL = new Set(['Compatibility', 'Configuration'])

function matches(row: Row, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([field, cond]) => {
    if (field === '$AND') return (cond as Record<string, unknown>[]).every((q) => matches(row, q))
    const op = cond as { $EQ?: unknown; $IN?: unknown[] }
    const value = row[field]
    if ('$EQ' in op) return value === op.$EQ
    if ('$IN' in op) return (op.$IN ?? []).includes(value)
    throw new Error(`fake: unsupported condition on ${field}`)
  })
}

/** tables: object name → every row, in insertion (creation) order. */
function fakeOctopus(tables: Record<string, Row[]>, opts: { code?: number } = {}) {
  const sent: Sent[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    sent.push({ url, method: init?.method ?? 'GET', auth: headers.get('authorization'), body })
    if (url !== `${BASE}/Read` || init?.method !== 'POST') {
      return new Response('not found', { status: 404 })
    }
    if (headers.get('authorization') !== `Bearer ${CREDS.accessToken}`) {
      return new Response('unauthorized', { status: 401 })
    }
    if (opts.code !== undefined)
      return Response.json({ Code: opts.code, Msg: ['Token is invalid'] })
    const objects = Object.keys(body).filter((k) => !TOP_LEVEL.has(k))
    if (objects.length !== 1) return new Response('one object per Read', { status: 400 })
    const object = objects[0]!
    const rows = tables[object]
    if (!rows) return new Response(`unknown object ${object}`, { status: 400 })
    const req = body[object] as Record<string, Record<string, unknown>>
    // Task docs: "// Required for using Top in Criteria" "Configuration": {
    // "Drivers": { "ITaskSearcher": "Maximizer.Model.Access.Sql.TaskSearcher" } }
    const drivers = (body.Configuration as { Drivers?: Record<string, unknown> } | undefined)
      ?.Drivers
    if (
      object === 'Task' &&
      req.Criteria?.Top !== undefined &&
      drivers?.ITaskSearcher !== 'Maximizer.Model.Access.Sql.TaskSearcher'
    ) {
      return new Response('Top on Task needs the ITaskSearcher driver', { status: 400 })
    }
    for (const k of Object.keys(req)) {
      if (!OBJECT_KEYS.has(k)) return new Response(`unknown key ${k}`, { status: 400 })
    }
    for (const k of Object.keys(req.Criteria ?? {})) {
      if (!CRITERIA_KEYS.has(k)) return new Response(`unknown criteria ${k}`, { status: 400 })
    }
    if (req.OrderBy && Object.keys(req.OrderBy).some((k) => k !== 'Fields')) {
      return new Response('only OrderBy.Fields is used', { status: 400 })
    }
    let hits = rows.filter((r) => matches(r, (req.Criteria?.SearchQuery ?? {}) as Row))
    const order = (req.OrderBy?.Fields as Record<string, 'ASC' | 'DESC'>[] | undefined)?.[0]
    if (order) {
      const [field, dir] = Object.entries(order)[0]!
      hits = [...hits].sort((a, b) => {
        const c = String(a[field]).localeCompare(String(b[field]))
        return dir === 'DESC' ? -c : c
      })
    }
    const top = req.Criteria?.Top
    if (typeof top === 'number') hits = hits.slice(0, top)
    return Response.json({ Code: 0, [object]: { Data: hits } })
  })
  return { sent }
}

const pad = (i: number) => String(i).padStart(3, '0')
const stamp = (i: number) => `2020-01-01T00:00:${pad(i).slice(1)}Z`

/**
 * AbEntry "Read - AbEntry": "Compatibility": { "AbEntryKey": "2.0" } and the
 * IAbEntrySearcher driver "for displaying Parent property".
 */
const ABENTRY_OPTIONS = {
  Compatibility: { AbEntryKey: '2.0' },
  Configuration: { Drivers: { IAbEntrySearcher: 'Maximizer.Model.Access.Sql.AbEntrySearcher' } },
}

type ListMethod =
  'listContacts' | 'listCompanies' | 'listDeals' | 'listPipelines' | 'listActivities' | 'listNotes'

const CASES: {
  list: ListMethod
  object: string
  row: (i: number) => Row
  search: Record<string, unknown>
  orderBy?: Record<string, string>
  /** Top-level Compatibility/Configuration the documented Read example sends. */
  options: Record<string, unknown>
  extra?: Record<string, Row[]>
}[] = [
  {
    list: 'listContacts',
    object: 'AbEntry',
    row: (i) => ({ ...documentedContact(), Key: `contact_${i}`, CreationDate: stamp(i) }),
    search: { Type: { $IN: ['Contact', 'Individual'] } },
    orderBy: { CreationDate: 'ASC' },
    options: ABENTRY_OPTIONS,
  },
  {
    list: 'listCompanies',
    object: 'AbEntry',
    row: (i) => ({ ...documentedCompany(), Key: `company_${i}`, CreationDate: stamp(i) }),
    search: { Type: { $EQ: 'Company' } },
    orderBy: { CreationDate: 'ASC' },
    options: ABENTRY_OPTIONS,
  },
  {
    list: 'listDeals',
    object: 'Opportunity',
    row: (i) => ({ ...documentedDeal(), Key: `deal_${i}`, CreationDate: stamp(i) }),
    search: {},
    orderBy: { CreationDate: 'ASC' },
    options: {
      Compatibility: { AbEntryKey: '2.0' },
      Configuration: {
        Drivers: { IOpportunitySearcher: 'Maximizer.Model.Access.Sql.OpportunitySearcher' },
      },
    },
  },
  {
    list: 'listPipelines',
    object: 'SalesProcessSetup',
    row: (i) => ({ ...documentedSalesProcess(), Key: `process_${i}` }),
    search: {},
    options: {},
    extra: { SalesStageSetup: [] },
  },
  {
    list: 'listActivities',
    object: 'Task',
    row: (i) => ({ ...documentedTask(), Key: `task_${i}`, DateTime: `2025-01-${pad(i)}` }),
    search: {},
    orderBy: { DateTime: 'ASC' },
    options: {
      Compatibility: { AbEntryKey: '2.0' },
      Configuration: { Drivers: { ITaskSearcher: 'Maximizer.Model.Access.Sql.TaskSearcher' } },
    },
  },
  {
    list: 'listNotes',
    object: 'Note',
    row: (i) => ({ ...documentedNote(), Key: `note_${i}`, DateTime: stamp(i) }),
    search: {},
    orderBy: { DateTime: 'ASC' },
    options: {},
  },
]

async function list(method: ListMethod, params: QueryParams): Promise<{ id: string }[]> {
  return (await new MaximizerAdapter()[method](CREDS, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)(
  'maximizer $list',
  ({ list: method, object, row, search, orderBy, options, extra }) => {
    const prefix = String(row(0).Key).split('_')[0]!
    const table = (n: number): Record<string, Row[]> => ({
      AbEntry: [],
      ...extra,
      [object]: Array.from({ length: n }, (_, i) => row(i + 1)),
    })

    it('pages 1..4 of 2L+1 rows serve every id once, in order, and end exactly', async () => {
      const L = 5
      fakeOctopus(table(2 * L + 1))
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3, 4]) {
        const params = withPageSink({ page, limit: L })
        seen.push(...(await list(method, params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `${prefix}_${i + 1}`))
      // A full answer says nothing (the next page is asked for); a short one ends it.
      expect(hasMore).toEqual([undefined, undefined, false, false])
    })

    it('a collection of exactly 2L rows ends on the empty third page', async () => {
      const L = 5
      fakeOctopus(table(2 * L))
      const p2 = withPageSink({ page: 2, limit: L })
      expect((await list(method, p2)).map((r) => r.id)).toEqual(
        [6, 7, 8, 9, 10].map((i) => `${prefix}_${i}`),
      )
      expect(readUpstreamPage(p2)?.hasMore).toBeUndefined()
      const p3 = withPageSink({ page: 3, limit: L })
      expect(await list(method, p3)).toEqual([])
      expect(readUpstreamPage(p3)?.hasMore).toBe(false)
    })

    it('page N sends POST /Read with Top = N × limit, the documented filter and order', async () => {
      const { sent } = fakeOctopus(table(3))
      await list(method, { page: 3, limit: 7 })
      const read = sent[0]!
      expect(read.url).toBe(`${BASE}/Read`)
      expect(read.method).toBe('POST')
      expect(read.auth).toBe(`Bearer ${CREDS.accessToken}`)
      const req = read.body[object] as Record<string, Record<string, unknown>>
      expect(req.Criteria).toEqual({ SearchQuery: search, Top: 21 })
      expect(req.OrderBy).toEqual(orderBy ? { Fields: [orderBy] } : undefined)
      expect(req.Scope?.Fields).toBeTypeOf('object')
    })

    it('sends the documented Compatibility/Configuration driver options', async () => {
      const { sent } = fakeOctopus(table(3))
      await list(method, { page: 1, limit: 5 })
      const topLevel = Object.fromEntries(
        Object.entries(sent[0]!.body).filter(([k]) => k !== object),
      )
      expect(topLevel).toEqual(options)
    })

    it('a Code 0 answer without <Object>.Data is an error, not an empty collection', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ Code: 0 }))
      await expect(list(method, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
        `no ${object}.Data array`,
      )
    })

    it('a negative Code is an error, not an empty page', async () => {
      fakeOctopus(table(3), { code: -1 })
      await expect(list(method, { page: 1, limit: 5 })).rejects.toThrow(/Code -1.*Token is invalid/)
    })
  },
)

describe('maximizer contacts and companies share AbEntry, split by Type', () => {
  it('listContacts serves Contact and Individual rows, never Company rows', async () => {
    fakeOctopus({
      AbEntry: [
        { ...documentedCompany(), Key: 'co_1', CreationDate: stamp(1) },
        { ...documentedContact(), Key: 'ct_1', CreationDate: stamp(2) },
        { ...documentedContact(), Key: 'in_1', Type: 'Individual', CreationDate: stamp(3) },
      ],
    })
    const rows = await new MaximizerAdapter().listContacts(CREDS, { page: 1, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['ct_1', 'in_1'])
    const companies = await new MaximizerAdapter().listCompanies(CREDS, { page: 1, limit: 10 })
    expect(companies.map((r) => r.id)).toEqual(['co_1'])
  })
})

describe('maximizer listPipelines stages', () => {
  it('reads the stages of this page of sales processes in one SalesStageSetup Read', async () => {
    const p1 = { ...documentedSalesProcess(), Key: 'p1' }
    const p2 = { ...documentedSalesProcess(), Key: 'p2' }
    const { sent } = fakeOctopus({
      SalesProcessSetup: [p1, p2],
      SalesStageSetup: [
        { ...documentedSalesStage(), Key: 's1', SalesProcessSetupKey: 'p1' },
        { ...documentedSalesStage(), Key: 's2', SalesProcessSetupKey: 'p2' },
      ],
    })
    const out = await new MaximizerAdapter().listPipelines(CREDS, { page: 2, limit: 1 })
    expect(out.map((p) => [p.id, p.stages?.map((s) => s.id)])).toEqual([['p2', ['s2']]])
    expect(sent[1]!.body).toEqual({
      SalesStageSetup: {
        Scope: {
          Fields: { Key: 1, Description: 1, SalesProcessSetupKey: 1, ProbabilityClose: 1 },
        },
        Criteria: { SearchQuery: { SalesProcessSetupKey: { $IN: ['p2'] } } },
      },
    })
  })

  it('sends no stage Read for an empty page', async () => {
    const { sent } = fakeOctopus({ SalesProcessSetup: [], SalesStageSetup: [] })
    expect(await new MaximizerAdapter().listPipelines(CREDS, { page: 1, limit: 5 })).toEqual([])
    expect(sent).toHaveLength(1)
  })
})

describe('maximizer get* by Key', () => {
  const tables = () => ({
    AbEntry: [documentedContact(), documentedCompany()],
    Opportunity: [documentedDeal()],
    SalesProcessSetup: [documentedSalesProcess()],
    SalesStageSetup: [documentedSalesStage()],
    Task: [documentedTask()],
    Note: [documentedNote()],
  })

  it.each([
    ['getContact', documentedContact().Key, 'AbEntry'],
    ['getCompany', documentedCompany().Key, 'AbEntry'],
    ['getDeal', documentedDeal().Key, 'Opportunity'],
    ['getPipeline', documentedSalesProcess().Key, 'SalesProcessSetup'],
    ['getActivity', documentedTask().Key, 'Task'],
    ['getNote', documentedNote().Key, 'Note'],
  ] as const)('%s reads one row by Key $EQ with Top 1', async (method, key, object) => {
    const { sent } = fakeOctopus(tables())
    const out = (await new MaximizerAdapter()[method](CREDS, key)) as { id: string }
    expect(out.id).toBe(key)
    const criteria = (sent[0]!.body[object] as { Criteria: Record<string, unknown> }).Criteria
    expect(criteria.Top).toBe(1)
    expect(JSON.stringify(criteria.SearchQuery)).toContain(`{"Key":{"$EQ":"${key}"}}`)
  })

  it('getContact does not return a Company with that Key', async () => {
    fakeOctopus(tables())
    await expect(
      new MaximizerAdapter().getContact(CREDS, documentedCompany().Key),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getCompany does not return a Contact with that Key', async () => {
    fakeOctopus(tables())
    await expect(
      new MaximizerAdapter().getCompany(CREDS, documentedContact().Key),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('an unknown Key is a 404', async () => {
    fakeOctopus(tables())
    await expect(new MaximizerAdapter().getNote(CREDS, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('maximizer base URL', () => {
  it('uses credentials.extra.instanceUrl for an on-premise BaseURL', async () => {
    const calls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      calls.push(String(input))
      return Response.json({ Code: 0, Note: { Data: [] } })
    })
    await new MaximizerAdapter().listNotes(
      { ...CREDS, extra: { instanceUrl: 'https://crm.example.test/api/Data.svc/json/' } },
      { page: 1, limit: 5 },
    )
    expect(calls).toEqual(['https://crm.example.test/api/Data.svc/json/Read'])
  })
})
