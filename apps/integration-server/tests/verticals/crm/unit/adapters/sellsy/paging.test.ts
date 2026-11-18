/**
 * Sellsy pipelines and notes (comments): endpoints and paging.
 *
 * Sellsy API v2 OpenAPI spec (https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml):
 * - GET /opportunities/pipelines ("Get list of opportunity pipelines") and
 *   GET /opportunities/pipelines/{pipelineId}/steps take `limit` ("The
 *   pagination limit", default 25, maximum 100) and `offset`.
 * - GET /comments ("Get a list of comments") takes the same.
 * - Every list returns `{ pagination: { limit, total, count, offset }, data }`.
 * - "Seek" pagination: "The offset value represents the LAST object in the
 *   response list, it's the default one used." The next request passes that
 *   string back as `offset`.
 *
 * The adapter used to call GET /pipelines, GET /pipelines/{id} and GET /notes,
 * none of which is in the spec. The fake upstream serves ONLY the documented
 * paths and parameters, and 404s everything else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { SellsyAdapter } from '../../../../../../src/verticals/crm/adapters/sellsy/index'
import { NoteSchema } from '../../../../../../src/verticals/crm/schema/note'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'

const creds: Credentials = { accessToken: 'sellsy-token' } as Credentials

let seen: URL[] = []

type Row = Record<string, unknown> & { id: number }

/** A seek-paged collection: honours only `limit` and a seek `offset`. */
function seek(rows: Row[], query: URLSearchParams) {
  for (const k of query.keys()) {
    if (k !== 'limit' && k !== 'offset') throw new Error(`undocumented parameter ${k}`)
  }
  const limit = Math.min(Number(query.get('limit') ?? '25'), 100)
  const offset = query.get('offset')
  let start = 0
  if (offset !== null) {
    // The seek offset names the LAST object of the previous page.
    const m = /^seek:(\d+)$/.exec(offset)
    if (!m) throw new Error(`not a seek offset this fake issued: ${offset}`)
    start = rows.findIndex((r) => r.id === Number(m[1])) + 1
  }
  const data = rows.slice(start, start + limit)
  const last = data[data.length - 1]
  return {
    data,
    pagination: {
      limit,
      total: rows.length,
      count: data.length,
      offset: last ? `seek:${last.id}` : 'seek:end',
    },
  }
}

function comments(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    description: `comment ${i + 1}`,
    owner: { id: 123, type: 'staff' },
    created: '1970-01-01T00:00:00+00:00',
    updated: '1970-01-01T00:00:00+00:00',
    parent_id: null,
    related: [{ id: 1, type: 'opportunity' }],
    company_id: 123,
    individual_id: null,
    contact_id: 123,
  }))
}

function pipelines(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Pipeline ${i + 1}`,
    is_default: i === 0,
    step: 2,
    rank: i,
  }))
}

function stepsOf(pipelineId: number, n = 2): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: pipelineId * 100 + i,
    name: `Step ${i}`,
    probability: 50,
    rank: i,
  }))
}

function install(routes: {
  comments?: Row[]
  pipelines?: Row[]
  steps?: (pipelineId: number) => Row[]
}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      seen.push(url)
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      if ((init?.method ?? 'GET') !== 'GET' || url.origin !== 'https://api.sellsy.com') {
        return json({ error: 'not found' }, 404)
      }
      const p = url.pathname
      if (p === '/v2/comments' && routes.comments)
        return json(seek(routes.comments, url.searchParams))
      if (p === '/v2/opportunities/pipelines' && routes.pipelines) {
        return json(seek(routes.pipelines, url.searchParams))
      }
      const m = /^\/v2\/opportunities\/pipelines\/(\d+)\/steps$/.exec(p)
      if (m && routes.steps) return json(seek(routes.steps(Number(m[1])), url.searchParams))
      return json({ error: 'not found' }, 404)
    }),
  )
}

beforeEach(() => {
  seen = []
  _resetCursorPager()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const L = 3
const N = 2 * L + 1

describe('sellsy listNotes reads GET /comments by seek cursor', () => {
  it('serves every row once, in order, with exact hasMore and total', async () => {
    install({ comments: comments(N) })
    const adapter = new SellsyAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listNotes(creds, params)
      for (const r of rows) NoteSchema.parse(r)
      got.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)
      more.push(meta?.hasMore)
      expect(meta?.totalCount).toBe(N)
      expect(meta?.pageSize).toBeUndefined()
    }
    expect(got).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
    expect(new Set(seen.map((u) => u.pathname))).toEqual(new Set(['/v2/comments']))
  })

  it('sends no offset on page 1 and the previous page’s seek offset on page 2', async () => {
    install({ comments: comments(N) })
    const adapter = new SellsyAdapter()
    await adapter.listNotes(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listNotes(creds, withPageSink({ page: 2, limit: L }))
    expect(seen[0]!.searchParams.has('offset')).toBe(false)
    expect(seen[0]!.searchParams.get('limit')).toBe(String(L))
    expect(seen[1]!.searchParams.get('offset')).toBe(`seek:${L}`)
    expect(seen[1]!.searchParams.get('limit')).toBe(String(L))
  })

  it('reaches page 3 cold by walking the seek chain', async () => {
    install({ comments: comments(N) })
    const params = withPageSink({ page: 3, limit: L })
    const rows = await new SellsyAdapter().listNotes(creds, params)
    expect(rows.map((r) => r.id)).toEqual([String(N)])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(seen).toHaveLength(3)
  })

  it('an exact multiple of the limit ends on pagination.total, with no extra request', async () => {
    install({ comments: comments(2 * L) })
    const adapter = new SellsyAdapter()
    const p2 = withPageSink({ page: 2, limit: L })
    await adapter.listNotes(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listNotes(creds, p2)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    const p3 = withPageSink({ page: 3, limit: L })
    expect(await adapter.listNotes(creds, p3)).toEqual([])
    expect(seen).toHaveLength(2)
  })

  it('clamps limit to the documented maximum of 100 and reports the size sent', async () => {
    install({ comments: comments(250) })
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new SellsyAdapter().listNotes(creds, params)
    expect(seen[0]!.searchParams.get('limit')).toBe('100')
    expect(rows).toHaveLength(100)
    expect(readUpstreamPage(params)).toMatchObject({
      hasMore: true,
      pageSize: 100,
      totalCount: 250,
    })
  })

  it('keeps a separate seek chain per limit on one connection', async () => {
    install({ comments: comments(N) })
    const adapter = new SellsyAdapter()
    await adapter.listNotes(creds, withPageSink({ page: 1, limit: 3 }))
    await adapter.listNotes(creds, withPageSink({ page: 2, limit: 3 }))
    const rows = await adapter.listNotes(creds, withPageSink({ page: 2, limit: 2 }))
    // Page 2 at limit 2 is rows 3 and 4, not a replay of limit 3's page-2 cursor.
    expect(rows.map((r) => r.id)).toEqual(['3', '4'])
  })

  it('throws when rows remain but pagination.offset is not a seek cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        seen.push(new URL(input))
        return new Response(
          JSON.stringify({
            data: comments(L),
            pagination: { limit: L, total: N, count: L, offset: L },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }),
    )
    await expect(
      new SellsyAdapter().listNotes(creds, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/not a seek cursor/)
  })

  it('a limit below 1 sends the documented default of 25, not 0', async () => {
    install({ comments: comments(30) })
    await new SellsyAdapter().listNotes(creds, withPageSink({ page: 1, limit: 0 }))
    expect(seen[0]!.searchParams.get('limit')).toBe('25')
  })

  it('an empty collection is one request and no more pages', async () => {
    install({ comments: [] })
    const params = withPageSink({ page: 1, limit: L })
    expect(await new SellsyAdapter().listNotes(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('sellsy listPipelines reads GET /opportunities/pipelines with their steps', () => {
  it('serves every pipeline once with exact hasMore, each with its own steps', async () => {
    install({ pipelines: pipelines(N), steps: (id) => stepsOf(id) })
    const adapter = new SellsyAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listPipelines(creds, params)
      for (const r of rows) {
        PipelineSchema.parse(r)
        expect(r.stages?.map((s) => s.id)).toEqual([`${r.id}00`, `${r.id}01`])
      }
      got.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(got).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
  })

  it('sends only the documented limit and seek offset to the pipelines list', async () => {
    install({ pipelines: pipelines(N), steps: (id) => stepsOf(id) })
    const adapter = new SellsyAdapter()
    await adapter.listPipelines(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listPipelines(creds, withPageSink({ page: 2, limit: L }))
    const lists = seen.filter((u) => u.pathname === '/v2/opportunities/pipelines')
    expect(lists).toHaveLength(2)
    expect(lists[0]!.searchParams.has('offset')).toBe(false)
    expect(lists[0]!.searchParams.get('limit')).toBe(String(L))
    expect(lists[1]!.searchParams.get('offset')).toBe(`seek:${L}`)
  })

  it('walks every page of a pipeline’s steps, including an uneven last page', async () => {
    install({ pipelines: pipelines(1), steps: (id) => stepsOf(id, 101) })
    const [pipeline] = await new SellsyAdapter().listPipelines(
      creds,
      withPageSink({ page: 1, limit: L }),
    )
    expect(pipeline!.stages).toHaveLength(101)
    const stepCalls = seen.filter((u) => u.pathname.endsWith('/steps'))
    expect(stepCalls.map((u) => u.searchParams.get('limit'))).toEqual(['100', '100'])
    expect(stepCalls[1]!.searchParams.get('offset')).toBe('seek:199')
  })
})

describe('sellsy getPipeline finds the pipeline in the documented list', () => {
  it('walks list pages until the id, then reads its steps', async () => {
    install({ pipelines: pipelines(150), steps: (id) => stepsOf(id) })
    const p = PipelineSchema.parse(await new SellsyAdapter().getPipeline(creds, '120'))
    expect(p.id).toBe('120')
    expect(p.name).toBe('Pipeline 120')
    expect(p.stages?.map((s) => s.id)).toEqual(['12000', '12001'])
    const lists = seen.filter((u) => u.pathname === '/v2/opportunities/pipelines')
    expect(lists).toHaveLength(2)
    expect(lists[1]!.searchParams.get('offset')).toBe('seek:100')
  })

  it('an unknown id is a 404 after the list ends', async () => {
    install({ pipelines: pipelines(3), steps: (id) => stepsOf(id) })
    await expect(new SellsyAdapter().getPipeline(creds, '99')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
