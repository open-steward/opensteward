/**
 * Pipeliner (Coevera) listPipelines / getPipeline.
 *
 * Stages come embedded in the Pipeline, per the api-parameters page
 * (https://developers.pipelinersales.com/api-docs/core-api-concepts/api-parameters):
 *   "{{baseUrl}}/entities/Pipelines?expand=steps"
 *   expand — "Expand related entity, to get immediate overview" — *.List, *.Get
 *   "If not used, the URI link will be returned instead."
 * There is no /entities/SalesStatuses in the vendor OpenAPI.
 *
 * Paging (https://developers.pipelinersales.com/api-docs/core-api-concepts/pagination):
 *   "Coevera sends a maximum of 100 (Default: 30) records per request. The limit can be changed
 *    by API parameter first ... To retrieve all data, it is recommended to use end_cursor with
 *    combination of API Parameter after. Iterate through the list, until the has_next_page is false"
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { PipelinerAdapter } from '../../../../../../src/verticals/crm/adapters/pipeliner/index'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'

const CREDS = { accessToken: 'pl_token', extra: { username: 'api_user', spaceId: 'space-1' } }
const MAX = 100
const DEFAULT = 30
const LIST_PARAMS = new Set(['first', 'after', 'expand'])

function stepsFor(n: number) {
  return [
    { id: `p${n}-s2`, name: 'Proposal', sort_order: 2, percent: 60 },
    { id: `p${n}-s1`, name: 'Lead', sort_order: 1, percent: 10 },
  ]
}

function pipelineRow(n: number, expanded: boolean) {
  return {
    is_delete_protected: false,
    id: String(n),
    is_deleted: false,
    modified: '2019-01-01T00:00:00',
    created: '2019-01-01T00:00:00',
    color: 1,
    name: `Pipeline ${n}`,
    revision: 1,
    steps: expanded
      ? stepsFor(n)
      : stepsFor(n).map((s) => `https://x/api/v100/rest/spaces/space-1/entities/Steps/${s.id}`),
    opportunity_types: [],
  }
}

/**
 * A fake Coevera that serves ONLY /entities/Pipelines (list: `first`, `after`, `expand`) and
 * /entities/Pipelines/{id} (`expand`). Steps come back as URI strings unless `expand=steps`.
 */
function fakeCoevera(total: number) {
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    sent.push(url)
    const auth = new Headers(init?.headers).get('authorization') ?? ''
    const expanded = url.searchParams.get('expand') === 'steps'
    const one = /^\/api\/v100\/rest\/spaces\/space-1\/entities\/Pipelines\/([^/]+)$/.exec(
      url.pathname,
    )
    if ((init?.method ?? 'GET') !== 'GET') return new Response('method', { status: 405 })
    if (one) {
      for (const k of url.searchParams.keys()) {
        if (k !== 'expand') return new Response(`unknown param ${k}`, { status: 400 })
      }
      const n = Number(one[1])
      if (!(n >= 1 && n <= total)) return new Response('not found', { status: 404 })
      return Response.json({ success: true, data: pipelineRow(n, expanded) })
    }
    if (url.pathname !== '/api/v100/rest/spaces/space-1/entities/Pipelines') {
      return new Response(`unexpected ${url.pathname}`, { status: 404 })
    }
    for (const k of url.searchParams.keys()) {
      if (!LIST_PARAMS.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    const rawFirst = url.searchParams.get('first')
    const first = rawFirst === null ? DEFAULT : Number(rawFirst)
    if (!Number.isInteger(first) || first < 1 || first > MAX) {
      return new Response(`first must be 1..${MAX}`, { status: 400 })
    }
    const binding = `${auth}|Pipelines`
    const after = url.searchParams.get('after')
    let offset = 0
    if (after !== null) {
      const decoded = Buffer.from(after, 'base64url').toString()
      const cut = decoded.lastIndexOf('|')
      if (decoded.slice(0, cut) !== binding) return new Response('bad cursor', { status: 400 })
      offset = Number(decoded.slice(cut + 1))
    }
    const data = Array.from({ length: Math.max(0, Math.min(first, total - offset)) }, (_, i) =>
      pipelineRow(offset + i + 1, expanded),
    )
    const end = offset + data.length
    return Response.json({
      success: true,
      total,
      data,
      page_info: {
        start_cursor: data.length ? 'start' : null,
        end_cursor: data.length ? Buffer.from(`${binding}|${end}`).toString('base64url') : null,
        has_previous_page: offset > 0,
        has_next_page: end < total,
      },
    })
  })
  return { sent }
}

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i))

function list(params: QueryParams) {
  return new PipelinerAdapter().listPipelines(CREDS, params)
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('pipeliner listPipelines', () => {
  it('sends one request per page to /entities/Pipelines with first and expand=steps', async () => {
    const { sent } = fakeCoevera(3)
    await list(withPageSink({ page: 1, limit: 5 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.pathname).toBe('/api/v100/rest/spaces/space-1/entities/Pipelines')
    expect(sent[0]!.searchParams.get('expand')).toBe('steps')
    expect(sent[0]!.searchParams.get('first')).toBe('5')
    expect(sent.some((u) => /SalesStatuses|Steps/.test(u.pathname))).toBe(false)
  })

  it('returns schema-valid pipelines with their embedded stages in sort_order', async () => {
    fakeCoevera(2)
    const rows = await list(withPageSink({ page: 1, limit: 5 }))
    expect(rows).toHaveLength(2)
    for (const r of rows) PipelineSchema.parse(r)
    expect(rows[0]!.stages?.map((s) => [s.id, s.order, s.win_probability])).toEqual([
      ['p1-s1', 0, 10],
      ['p1-s2', 1, 60],
    ])
  })

  it('pages 1..3 of 2L+1 pipelines return every id once, with exact hasMore', async () => {
    const L = 4
    const { sent } = fakeCoevera(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await list(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(sent).toHaveLength(3)
    expect(sent[0]!.searchParams.get('after')).toBeNull()
    expect(sent[1]!.searchParams.get('after')).not.toBeNull()
  })

  it('a limit above 100 is clamped, reported, and still walks every row', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakeCoevera(total)
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: 250 })
      seen.push(...(await list(params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, total))
    expect(sent.every((u) => u.searchParams.get('first') === String(MAX))).toBe(true)
  })

  it('reports the top-level total', async () => {
    fakeCoevera(9)
    const params = withPageSink({ page: 1, limit: 4 })
    await list(params)
    expect(readUpstreamPage(params)?.totalCount).toBe(9)
  })
})

describe('pipeliner getPipeline', () => {
  it('reads /entities/Pipelines/{id}?expand=steps and nothing else', async () => {
    const { sent } = fakeCoevera(3)
    const p = await new PipelinerAdapter().getPipeline(CREDS, '2')
    PipelineSchema.parse(p)
    expect(p.id).toBe('2')
    expect(p.stages?.map((s) => s.id)).toEqual(['p2-s1', 'p2-s2'])
    expect(sent).toHaveLength(1)
    expect(sent[0]!.pathname).toBe('/api/v100/rest/spaces/space-1/entities/Pipelines/2')
    expect(sent[0]!.searchParams.get('expand')).toBe('steps')
  })

  it('URI-encodes the id so a "/" cannot reach another path', async () => {
    const seen: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      seen.push(String(input))
      return Response.json({
        success: true,
        data: {
          id: 'a/b',
          name: 'P',
          created: '2019-01-01T00:00:00',
          modified: '2019-01-01T00:00:00',
          steps: [],
        },
      })
    })
    await new PipelinerAdapter().getPipeline(CREDS, 'a/b')
    expect(seen).toHaveLength(1)
    expect(new URL(seen[0]!).pathname).toBe(
      '/api/v100/rest/spaces/space-1/entities/Pipelines/a%2Fb',
    )
  })
})
