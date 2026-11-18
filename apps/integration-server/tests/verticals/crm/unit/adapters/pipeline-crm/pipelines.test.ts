/**
 * Pipeline CRM listPipelines: GET /admin/deal_pipelines paged by the caller's
 * `page` and `per_page`, with each pipeline's stages attached from
 * GET /admin/deal_stages grouped by `deal_pipeline_id`.
 *
 * https://app.pipelinecrm.com/llms/deal-pipelines.md, GET /admin/deal_pipelines:
 *   "| `page` | query | integer | no | Page number |"
 *   "| `per_page` | query | integer | no | Records per page, at most 200 |"
 * https://app.pipelinecrm.com/llms/deal-stages.md: "## GET /admin/deal_stages"
 *   (no parameters; returns `DealStageList` with fields: pagination, entries)
 * https://app.pipelinecrm.com/openapi.json, Pagination.page:
 *   "The page returned. Request another with `?page=N`."
 *   Pagination.pages: "Number of pages at this `per_page`."
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { PipelineCrmAdapter } from '../../../../../../src/verticals/crm/adapters/pipeline-crm/index'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/crm/adapters/pipeline-crm/constants'

const CREDS = { accessToken: 'pcrm_live_token' }
const BASE = 'https://api.pipelinecrm.com/api/v3'
/** Documented: "There is a hard limit of **200** items for any request." */
const MAX = 200

/**
 * A fake Pipeline CRM that honours ONLY documented parameters: `page` and
 * `per_page` (1..200, default 200) on /admin/deal_pipelines, and `page` on
 * /admin/deal_stages, which serves `stagePageSize` rows per page (the real
 * default is 200; smaller here so the stage walk crosses pages).
 */
function fakePipelineCrm(
  pipelineCount: number,
  stagesPerPipeline: number[],
  stagePageSize = 3,
  opts: { omitPages?: boolean; stageTotalOverstatedBy?: number } = {},
) {
  const pipelines = Array.from({ length: pipelineCount }, (_, i) => ({
    id: 100 + i,
    name: `Pipeline ${i + 1}`,
    default: i === 0,
    pipeline_type: 'sales',
    description: null,
    created_at: '2026-01-15 09:30:00',
    updated_at: '2026-02-01 14:20:00',
    has_deals: false,
    count_deals: 0,
    won_stage: null,
    lost_stage: null,
  }))
  let nextStage = 1
  const stages = pipelines.flatMap((p, i) =>
    Array.from({ length: stagesPerPipeline[i] ?? 0 }, (_, j) => ({
      id: nextStage++,
      created_at: '2026-01-15 09:30:00',
      updated_at: '2026-02-01 14:20:00',
      name: `Stage ${j + 1}`,
      percent: (j + 1) * 10,
      deal_pipeline_id: p.id,
    })),
  )
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const auth = new Headers(init?.headers).get('authorization')
    if (auth !== `Bearer ${CREDS.accessToken}`) return new Response('unauthorized', { status: 401 })
    if ((init?.method ?? 'GET') !== 'GET') return new Response('unexpected method', { status: 405 })
    sent.push(url)
    const page = Number(url.searchParams.get('page') ?? '1')
    if (!Number.isInteger(page) || page < 1)
      return new Response(`bad page ${String(page)}`, { status: 400 })

    let rows: unknown[]
    let perPage: number
    if (url.pathname === '/api/v3/admin/deal_pipelines') {
      for (const k of url.searchParams.keys()) {
        if (k !== 'page' && k !== 'per_page')
          return new Response(`unknown param ${k}`, { status: 400 })
      }
      perPage = Number(url.searchParams.get('per_page') ?? String(MAX))
      if (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX) {
        return new Response(`bad per_page ${String(perPage)}`, { status: 400 })
      }
      rows = pipelines
    } else if (url.pathname === '/api/v3/admin/deal_stages') {
      for (const k of url.searchParams.keys()) {
        if (k !== 'page') return new Response(`unknown param ${k}`, { status: 400 })
      }
      perPage = stagePageSize
      rows = stages
    } else {
      return new Response(`no such path ${url.pathname}`, { status: 404 })
    }
    const entries = rows.slice((page - 1) * perPage, page * perPage)
    const total = rows === stages ? rows.length + (opts.stageTotalOverstatedBy ?? 0) : rows.length
    // getting-started.md's examples carry only page, per_page and total;
    // the openapi Pagination schema adds an optional `pages`.
    const pagination = opts.omitPages
      ? { page, per_page: perPage, total }
      : { page, per_page: perPage, total, pages: Math.ceil(total / perPage) }
    return new Response(JSON.stringify({ entries, pagination }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { pipelines, stages, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pipeline-crm listPipelines', () => {
  it('declares the documented 200-row maximum', () => {
    expect(new PipelineCrmAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('serves every pipeline once over pages 1..3 of 2L+1, with exact hasMore and total', async () => {
    const L = 2
    const { pipelines } = fakePipelineCrm(2 * L + 1, [2, 0, 3, 1, 2])
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    const totals: (number | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await new PipelineCrmAdapter().listPipelines(CREDS, params)
      rows.forEach((r) => PipelineSchema.parse(r))
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      totals.push(readUpstreamPage(params)?.totalCount)
    }
    expect(seen).toEqual(pipelines.map((p) => String(p.id)))
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
    expect(totals).toEqual([5, 5, 5])
  })

  it('sends the caller page and limit to GET /admin/deal_pipelines', async () => {
    const { sent } = fakePipelineCrm(9, [])
    await new PipelineCrmAdapter().listPipelines(CREDS, withPageSink({ page: 2, limit: 4 }))
    const pipelineReqs = sent.filter((u) => u.pathname.endsWith('/admin/deal_pipelines'))
    expect(pipelineReqs).toHaveLength(1)
    expect(pipelineReqs[0].origin + pipelineReqs[0].pathname).toBe(`${BASE}/admin/deal_pipelines`)
    expect(pipelineReqs[0].searchParams.get('page')).toBe('2')
    expect(pipelineReqs[0].searchParams.get('per_page')).toBe('4')
  })

  it('never calls the undocumented /deal_stages path', async () => {
    const { sent } = fakePipelineCrm(2, [1, 1])
    await new PipelineCrmAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(sent.some((u) => u.pathname === '/api/v3/deal_stages')).toBe(false)
  })

  it('clamps per_page to the documented 200 and reports the size sent', async () => {
    const { sent } = fakePipelineCrm(3, [])
    const params = withPageSink({ page: 1, limit: 500 })
    await new PipelineCrmAdapter().listPipelines(CREDS, params)
    const req = sent.find((u) => u.pathname.endsWith('/admin/deal_pipelines'))!
    expect(req.searchParams.get('per_page')).toBe('200')
    expect(readUpstreamPage(params)?.pageSize).toBe(200)
  })

  it('does not report a pageSize when the limit is within the documented max', async () => {
    fakePipelineCrm(3, [])
    const params = withPageSink({ page: 1, limit: 50 })
    await new PipelineCrmAdapter().listPipelines(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('attaches each pipeline its own stages, walking every /admin/deal_stages page', async () => {
    // 3 + 0 + 4 = 7 stages over stage pages of 3: pages 1, 2 and 3 (uneven last page).
    const { sent } = fakePipelineCrm(3, [3, 0, 4], 3)
    const rows = await new PipelineCrmAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    const stagePages = sent
      .filter((u) => u.pathname.endsWith('/admin/deal_stages'))
      .map((u) => u.searchParams.get('page') ?? '1')
    expect(stagePages).toEqual(['1', '2', '3'])
    expect(rows.map((r) => r.stages?.map((s) => s.id))).toEqual([
      ['1', '2', '3'],
      [],
      ['4', '5', '6', '7'],
    ])
    expect(rows[2].stages?.map((s) => s.win_probability)).toEqual([10, 20, 30, 40])
  })

  it('asks for no stages when the pipeline page is empty', async () => {
    const { sent } = fakePipelineCrm(2, [1, 1])
    const params = withPageSink({ page: 5, limit: 2 })
    const rows = await new PipelineCrmAdapter().listPipelines(CREDS, params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(sent.some((u) => u.pathname.endsWith('/admin/deal_stages'))).toBe(false)
  })

  it('ends the walk from page, per_page and total when the response carries no `pages`', async () => {
    const L = 2
    const { pipelines, sent } = fakePipelineCrm(2 * L + 1, [2, 0, 3, 1, 2], 3, { omitPages: true })
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    const totalPages: (number | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await new PipelineCrmAdapter().listPipelines(CREDS, params)
      rows.forEach((r) => PipelineSchema.parse(r))
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      totalPages.push(readUpstreamPage(params)?.totalPages)
    }
    expect(seen).toEqual(pipelines.map((p) => String(p.id)))
    expect(more).toEqual([true, true, false])
    expect(totalPages).toEqual([undefined, undefined, undefined])
    // 8 stages over stage pages of 3: every walk reads pages 1, 2 and 3, then stops.
    const stagePages = sent
      .filter((u) => u.pathname.endsWith('/admin/deal_stages'))
      .map((u) => u.searchParams.get('page'))
    expect(stagePages).toEqual(['1', '2', '3', '1', '2', '3', '1', '2', '3'])
  })

  it('reports the documented pages and page as totalPages and currentPage when present', async () => {
    fakePipelineCrm(5, [])
    const params = withPageSink({ page: 2, limit: 2 })
    await new PipelineCrmAdapter().listPipelines(CREDS, params)
    expect(readUpstreamPage(params)?.totalPages).toBe(3)
    expect(readUpstreamPage(params)?.currentPage).toBe(2)
  })

  it('stops the stage walk on an empty page even if total overstates the rows', async () => {
    // 2 stages, total claims 12: page 1 has both rows, page 2 is empty.
    const { sent } = fakePipelineCrm(1, [2], 3, { omitPages: true, stageTotalOverstatedBy: 10 })
    const rows = await new PipelineCrmAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(rows[0].stages?.map((s) => s.id)).toEqual(['1', '2'])
    const stagePages = sent
      .filter((u) => u.pathname.endsWith('/admin/deal_stages'))
      .map((u) => u.searchParams.get('page'))
    expect(stagePages).toEqual(['1', '2'])
  })

  it('sends the adapter default page size when the caller gives no limit', async () => {
    const { sent } = fakePipelineCrm(3, [])
    await new PipelineCrmAdapter().listPipelines(CREDS, withPageSink({ page: 1 }))
    const req = sent.find((u) => u.pathname.endsWith('/admin/deal_pipelines'))!
    expect(req.searchParams.get('per_page')).toBe(String(DEFAULT_PAGE_SIZE))
  })

  it('reports no more rows when the last page is exactly full, and reads no empty stage page', async () => {
    // 4 pipelines at 2 per page; 6 stages over stage pages of 3.
    const { sent } = fakePipelineCrm(4, [3, 3, 0, 0], 3, { omitPages: true })
    const params = withPageSink({ page: 2, limit: 2 })
    const rows = await new PipelineCrmAdapter().listPipelines(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['102', '103'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    const stagePages = sent
      .filter((u) => u.pathname.endsWith('/admin/deal_stages'))
      .map((u) => u.searchParams.get('page'))
    expect(stagePages).toEqual(['1', '2'])
  })
})
