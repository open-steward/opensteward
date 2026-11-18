/**
 * Teamleader listPipelines: POST /dealPipelines.list paged by the caller's
 * page/limit, each pipeline's stages from POST /dealPhases.list filtered by
 * `deal_pipeline_id` and walked to a short page.
 *
 * From https://developer.focus.teamleader.eu/docs/api/deal-pipelines-list
 * (content chunk https://developer.focus.teamleader.eu/assets/js/0dc31f63.124908a6.js):
 *
 *   "title":"dealPipelines.list","description":"Get a list of all deal pipelines."
 *   request: "filter":{ids, status, term}, "page":{"title":"Page","type":"object",
 *     "properties":{"size":{"type":"number","default":20},"number":{"type":"number","default":1}}}
 *   response example: {"data":[{"id":"f350e48a-fbc3-0a79-e62a-53aa1ae86d44","name":"Main Pipeline"}],
 *     "meta":{"default":"f350e48a-fbc3-0a79-e62a-53aa1ae86d44","page":{"size":10,"number":2},"matches":12}}
 *   meta.matches: "Only included with request parameter `includes=pagination`"
 *
 * From https://developer.focus.teamleader.eu/docs/api/deal-phases-list
 * (content chunk https://developer.focus.teamleader.eu/assets/js/6f13b6c5.e5a00ce2.js):
 *
 *   "Get a list of all phases a deal can go through, sorted by their order in the flow."
 *   request: "filter":{"ids":[...],"deal_pipeline_id":{"type":"string"}}, same "page"
 *   response example: {"data":[{"id":"21efc56e-1ba8-469d-926a-e89502591b47","name":"New",
 *     "actions":["create_event"],"requires_attention_after":{"amount":7,"unit":"days"},"probability":0.75}]}
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, type QueryParams } from '@opensteward/shared'
import { TeamleaderAdapter } from '../../../../../../src/verticals/crm/adapters/teamleader/index'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'

const CREDS = { accessToken: 'tl_test' }
const BASE = 'https://api.focus.teamleader.eu'

type Body = Record<string, unknown>

interface FakeOpts {
  pipelines: Array<{ id: string; name: string }>
  phases: Record<string, Array<Record<string, unknown>>>
  matches?: boolean
}

/**
 * A fake Teamleader that honours only the documented body: `filter` (ids,
 * status, term for pipelines; ids, deal_pipeline_id for phases) and `page`
 * {size default 20, number default 1}. Any other top-level key is refused.
 */
function fakeTeamleader(opts: FakeOpts) {
  const calls: Array<{ action: string; body: Body }> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const action = url.slice(BASE.length + 1)
    if (!url.startsWith(`${BASE}/`) || init?.method !== 'POST') {
      return new Response('unexpected', { status: 404 })
    }
    const headers = init.headers as Record<string, string>
    if (headers['Authorization'] !== `Bearer ${CREDS.accessToken}`) {
      return new Response('unauthorized', { status: 401 })
    }
    const body = JSON.parse(String(init.body ?? '{}')) as Body
    calls.push({ action, body })
    for (const key of Object.keys(body)) {
      if (key !== 'filter' && key !== 'page') {
        return new Response(`unknown key ${key}`, { status: 400 })
      }
    }
    const page = (body['page'] ?? {}) as { size?: number; number?: number }
    const size = page.size ?? 20
    const number = page.number ?? 1
    const filter = (body['filter'] ?? {}) as Record<string, unknown>
    let rows: Array<Record<string, unknown>>
    if (action === 'dealPipelines.list') {
      rows = opts.pipelines
    } else if (action === 'dealPhases.list') {
      const pid = filter['deal_pipeline_id']
      rows = typeof pid === 'string' ? (opts.phases[pid] ?? []) : Object.values(opts.phases).flat()
    } else {
      return new Response(`unknown action ${action}`, { status: 404 })
    }
    const start = (number - 1) * size
    const data = rows.slice(start, start + size)
    const meta =
      action === 'dealPipelines.list'
        ? {
            default: opts.pipelines[0]?.id,
            ...(opts.matches ? { page: { size, number }, matches: rows.length } : {}),
          }
        : undefined
    return new Response(JSON.stringify(meta ? { data, meta } : { data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return calls
}

afterEach(() => vi.restoreAllMocks())

const DOC_PIPELINE = { id: 'f350e48a-fbc3-0a79-e62a-53aa1ae86d44', name: 'Main Pipeline' }
const DOC_PHASE = {
  id: '21efc56e-1ba8-469d-926a-e89502591b47',
  name: 'New',
  actions: ['create_event'],
  requires_attention_after: { amount: 7, unit: 'days' },
  probability: 0.75,
}

describe('teamleader listPipelines', () => {
  it('lists pipelines from dealPipelines.list, not a synthetic default pipeline', async () => {
    const calls = fakeTeamleader({
      pipelines: [DOC_PIPELINE],
      phases: { [DOC_PIPELINE.id]: [DOC_PHASE] },
    })
    const out = await new TeamleaderAdapter().listPipelines(CREDS, { page: 1, limit: 10 })
    expect(out).toHaveLength(1)
    const p = PipelineSchema.parse(out[0])
    expect(p.id).toBe(DOC_PIPELINE.id)
    expect(p.name).toBe('Main Pipeline')
    expect(p.stages).toEqual([{ id: DOC_PHASE.id, name: 'New', order: 0, win_probability: 75 }])
    expect(calls[0]).toEqual({
      action: 'dealPipelines.list',
      body: { page: { size: 10, number: 1 } },
    })
    expect(calls[1]).toEqual({
      action: 'dealPhases.list',
      body: { filter: { deal_pipeline_id: DOC_PIPELINE.id }, page: { size: 20, number: 1 } },
    })
  })

  it("sends the caller's page and limit", async () => {
    const calls = fakeTeamleader({ pipelines: [], phases: {} })
    await new TeamleaderAdapter().listPipelines(CREDS, { page: 3, limit: 7 })
    expect(calls).toEqual([
      { action: 'dealPipelines.list', body: { page: { size: 7, number: 3 } } },
    ])
  })

  it('walks every phase of a pipeline past one phase page, in flow order', async () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ id: `ph${i}`, name: `Phase ${i}` }))
    const exact = Array.from({ length: 20 }, (_, i) => ({ id: `ex${i}`, name: `Ex ${i}` }))
    const calls = fakeTeamleader({
      pipelines: [
        { id: 'p1', name: 'One' },
        { id: 'p2', name: 'Two' },
        { id: 'p3', name: 'Three' },
      ],
      phases: { p1: many, p2: [], p3: exact },
    })
    const out = await new TeamleaderAdapter().listPipelines(CREDS, { page: 1, limit: 10 })
    expect(out.map((p) => p.stages?.length)).toEqual([41, 0, 20])
    expect(out[0].stages?.map((s) => s.id)).toEqual(many.map((m) => m.id))
    expect(out[0].stages?.map((s) => s.order)).toEqual(many.map((_, i) => i))
    // No stage leaks across pipelines.
    expect(out[2].stages?.every((s) => s.id.startsWith('ex'))).toBe(true)
    const phaseCalls = calls.filter((c) => c.action === 'dealPhases.list')
    expect(
      phaseCalls.map((c) => [
        (c.body['filter'] as Body)['deal_pipeline_id'],
        (c.body['page'] as Body)['number'],
      ]),
    ).toEqual([
      ['p1', 1],
      ['p1', 2],
      ['p1', 3],
      ['p2', 1],
      ['p3', 1],
      ['p3', 2],
    ])
  })

  // The production shape: the adapter never sends `includes=pagination` (it is
  // not in dealPipelines.list's request schema), so Teamleader sends no
  // meta.matches and the end of the collection is the first short page.
  it('pages N = 2L + 1 pipelines without meta.matches: every id once, ends on the short page', async () => {
    const L = 4
    const pipelines = Array.from({ length: 2 * L + 1 }, (_, i) => ({ id: `pl${i}`, name: `P${i}` }))
    fakeTeamleader({ pipelines, phases: {} })
    const adapter = new TeamleaderAdapter()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listPipelines(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      expect(readUpstreamPage(params)).toBeUndefined()
      hasMore.push(rows.length === L)
      if (rows.length < L) break
    }
    expect(seen).toEqual(pipelines.map((p) => p.id))
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
  })

  // Defensive only: the docs tie meta.matches to `includes=pagination`, which
  // this adapter does not send. If Teamleader ever returns it, it is reported.
  it('pages N = 2L + 1 pipelines: reports meta.matches as totalCount when present', async () => {
    const L = 4
    const pipelines = Array.from({ length: 2 * L + 1 }, (_, i) => ({ id: `pl${i}`, name: `P${i}` }))
    fakeTeamleader({ pipelines, phases: {}, matches: true })
    const adapter = new TeamleaderAdapter()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listPipelines(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      const total = readUpstreamPage(params)?.totalCount
      expect(total).toBe(2 * L + 1)
      hasMore.push(page * L < (total as number))
      if (rows.length < L) break
    }
    expect(seen).toEqual(pipelines.map((p) => p.id))
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports no total when the platform sends no meta.matches', async () => {
    fakeTeamleader({ pipelines: [DOC_PIPELINE], phases: {} })
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    await new TeamleaderAdapter().listPipelines(CREDS, params)
    expect(readUpstreamPage(params)).toBeUndefined()
  })
})
