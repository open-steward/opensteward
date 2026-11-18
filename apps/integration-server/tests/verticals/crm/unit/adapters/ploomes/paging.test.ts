import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { PloomesAdapter } from '../../../../../../src/verticals/crm/adapters/ploomes/index'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import { NoteSchema } from '../../../../../../src/verticals/crm/schema/note'

/**
 * Ploomes collections are OData (https://developers.ploomes.com/json/openapi.json):
 *
 *   "Always use OData query best practices: $top and $skip for paging (try to
 *    limit pages up to 100 items)"
 *   "That limit is 300 items for the entities: Contacts, Deals, Cities, Tasks,
 *    Orders e Quotes."
 *
 * Every list GET documents the query parameters $top, $skip, $select, $expand,
 * $filter ("Id+eq+12345") and $orderby ("Id+desc"), and no path documents a
 * GET on Entity({Id}). The fake below honours exactly those parameters and
 * answers 400 to anything else, and answers the OData collection shape: "A
 * collection of entities is represented as a JSON object containing a
 * name/value pair named value" (OData JSON Format v4.01).
 *
 * The adapter used to read pipelines from /Funnels, activities from /Actions,
 * notes from /Notes and companies from /Accounts: none of the four is among
 * the spec's paths.
 */

const HOST = 'https://api2.ploomes.com'
const creds = { accessToken: 'user-key' }
const DOCUMENTED = new Set(['$top', '$skip', '$select', '$expand', '$filter', '$orderby'])
let requests: URL[] = []

type Row = Record<string, unknown> & { Id: number }

function pipelineRow(i: number): Row {
  return {
    Id: i,
    Name: `Funil ${i}`,
    Ordination: i,
    Stages: [
      { Id: i * 100 + 2, Name: 'Proposta', PipelineId: i, Ordination: 2 },
      { Id: i * 100 + 1, Name: 'Contato', PipelineId: i, Ordination: 1 },
    ],
  }
}
function taskRow(i: number): Row {
  return {
    Id: i,
    Title: `Tarefa ${i}`,
    Description: 'Descrição teste',
    TypeId: 1,
    ContactId: 23,
    DealId: null,
  }
}
function recordRow(i: number): Row {
  return {
    Id: i,
    ContactId: 23,
    DealId: null,
    Date: '2023-01-17T21:31:28.69-03:00',
    Content: `Comentário ${i}`,
    TypeId: 1,
  }
}

/** Serves `rows` at `path`, capped at `cap` rows per request when the entity has a cap. */
function serve(path: string, rows: Row[], cap?: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      requests.push(url)
      expect((init?.headers as Record<string, string>)['User-Key']).toBe('user-key')
      for (const k of url.searchParams.keys()) {
        if (!DOCUMENTED.has(k)) return new Response(`unknown parameter ${k}`, { status: 400 })
      }
      if (url.origin !== HOST || url.pathname !== path) {
        return new Response('not found', { status: 404 })
      }
      let out = [...rows]
      const orderby = url.searchParams.get('$orderby')
      if (orderby !== null) {
        if (orderby !== 'Id') return new Response('bad $orderby', { status: 400 })
        out.sort((a, b) => a.Id - b.Id)
      }
      const filter = url.searchParams.get('$filter')
      if (filter !== null) {
        const m = /^Id eq (\d+)$/.exec(filter)
        if (!m) return new Response('bad $filter', { status: 400 })
        out = out.filter((r) => r.Id === Number(m[1]))
      }
      const expand = url.searchParams.get('$expand')
      if (expand === null) out = out.map(({ Stages: _s, ...r }) => r as Row)
      const skip = Number(url.searchParams.get('$skip') ?? 0)
      const topRaw = url.searchParams.get('$top')
      let top = topRaw === null ? out.length : Number(topRaw)
      if (cap !== undefined) top = Math.min(top, cap)
      return new Response(JSON.stringify({ value: out.slice(skip, skip + top) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

type ListMethod = 'listPipelines' | 'listActivities' | 'listNotes'
type GetMethod = 'getPipeline' | 'getActivity' | 'getNote'

function list(method: ListMethod | 'listCompanies', params: QueryParams) {
  const a = new PloomesAdapter()
  return (a[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>).call(
    a,
    creds,
    params,
  )
}
function get(method: GetMethod | 'getCompany', id: string) {
  const a = new PloomesAdapter()
  return (a[method] as (c: typeof creds, id: string) => Promise<{ id: string }>).call(a, creds, id)
}

const CASES: Array<{
  method: ListMethod
  getter: GetMethod
  path: string
  row: (i: number) => Row
  expand: string | null
  schema: { parse: (v: unknown) => unknown }
}> = [
  {
    method: 'listPipelines',
    getter: 'getPipeline',
    path: '/Deals@Pipelines',
    row: pipelineRow,
    expand: 'Stages',
    schema: PipelineSchema,
  },
  {
    method: 'listActivities',
    getter: 'getActivity',
    path: '/Tasks',
    row: taskRow,
    expand: null,
    schema: ActivitySchema,
  },
  {
    method: 'listNotes',
    getter: 'getNote',
    path: '/InteractionRecords',
    row: recordRow,
    expand: null,
    schema: NoteSchema,
  },
]

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)('ploomes $method', ({ method, getter, path, row, expand, schema }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    // Upstream order is not id order; $orderby=Id makes $skip stable.
    const rows = [5, 1, 7, 3, 2, 6, 4].map(row)
    serve(path, rows)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const out = await list(method, params)
      for (const r of out) schema.parse(r)
      seen.push(...out.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented OData request: $top = limit, $skip from the 1-based page', async () => {
    serve(path, [1, 2, 3].map(row))
    await list(method, withPageSink({ page: 2, limit: 7 }))
    expect(requests).toHaveLength(1)
    const url = requests[0]!
    expect(url.pathname).toBe(path)
    expect(url.searchParams.get('$top')).toBe('7')
    expect(url.searchParams.get('$skip')).toBe('7')
    expect(url.searchParams.get('$orderby')).toBe('Id')
    expect(url.searchParams.get('$expand')).toBe(expand)
  })

  it('page 1 starts at the first row', async () => {
    serve(path, [1, 2].map(row))
    const out = await list(method, withPageSink({ page: 1, limit: 10 }))
    expect(out.map((r) => r.id)).toEqual(['1', '2'])
    expect(requests[0]!.searchParams.get('$skip')).toBe('0')
  })

  it(`${getter} reads one record through $filter=Id eq N`, async () => {
    serve(path, [1, 2, 3].map(row))
    const out = await get(getter, '2')
    schema.parse(out)
    expect(out.id).toBe('2')
    expect(requests[0]!.pathname).toBe(path)
    expect(requests[0]!.searchParams.get('$filter')).toBe('Id eq 2')
    expect(requests[0]!.searchParams.get('$expand')).toBe(expand)
  })

  it(`${getter} answers 404 for an id the filter does not find`, async () => {
    serve(path, [1].map(row))
    await expect(get(getter, '9')).rejects.toMatchObject({ statusCode: 404 })
  })

  it(`${getter} refuses a non-integer id without sending it into $filter`, async () => {
    serve(path, [1].map(row))
    await expect(get(getter, '1 or Id gt 0')).rejects.toMatchObject({ statusCode: 404 })
    expect(requests).toHaveLength(0)
  })
})

describe('ploomes listPipelines', () => {
  it('maps the expanded Stages in Ordination order', async () => {
    serve('/Deals@Pipelines', [pipelineRow(1)])
    const [p] = (await list(
      'listPipelines',
      withPageSink({ page: 1, limit: 10 }),
    )) as unknown as Array<ReturnType<typeof PipelineSchema.parse>>
    expect(p!.stages).toEqual([
      { id: '101', name: 'Contato', order: 0 },
      { id: '102', name: 'Proposta', order: 1 },
    ])
  })

  it('does not turn an upstream 404 into an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    )
    await expect(list('listPipelines', withPageSink({ page: 1, limit: 10 }))).rejects.toMatchObject(
      {
        statusCode: 404,
      },
    )
  })
})

describe('ploomes listActivities', () => {
  it('clamps $top to the documented 300 for Tasks and reports the size it sent', async () => {
    const rows = Array.from({ length: 700 }, (_, i) => taskRow(i + 1))
    serve('/Tasks', rows, 300)
    const params = withPageSink({ page: 2, limit: 500 })
    const out = await list('listActivities', params)
    expect(requests[0]!.searchParams.get('$top')).toBe('300')
    expect(requests[0]!.searchParams.get('$skip')).toBe('300')
    expect(out).toHaveLength(300)
    expect(out[0]!.id).toBe('301')
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 300, hasMore: true })
  })
})

describe('ploomes companies', () => {
  it('listCompanies refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    serve('/Contacts', [])
    await expect(list('listCompanies', withPageSink({ page: 1, limit: 10 }))).rejects.toMatchObject(
      {
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Ploomes cannot list companies: /),
      },
    )
    expect(requests).toHaveLength(0)
  })

  it('getCompany refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    serve('/Contacts', [])
    await expect(get('getCompany', '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Ploomes cannot read a company: /),
    })
    expect(requests).toHaveLength(0)
  })
})
