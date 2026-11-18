import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ZohoCrmAdapter } from '../../../../../../src/verticals/crm/adapters/zoho-crm/index'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'

/**
 * Zoho CRM documents pipelines only per Deals layout:
 *   GET /settings/pipeline?layout_id={layout_id} — "layout_id string, mandatory
 *   ... for fetching all pipelines and a specific pipeline. The system throws an
 *   error, otherwise." (https://www.zoho.com/crm/developer/docs/api/v8/get-pipelines.html)
 * and the layout ids come from
 *   GET /settings/layouts?module={module_API_name} — "module string, mandatory"
 *   (https://www.zoho.com/crm/developer/docs/api/v8/layouts-meta.html).
 * Neither documents paging. The adapter used to send `module=Deals` to the
 * pipeline endpoint with no layout_id (a documented 400 REQUIRED_PARAM_MISSING).
 */

const creds = { accessToken: 'tok' }
const BASE = '/crm/v8'
let requests: URL[] = []

function stage(id: string, n: number) {
  return {
    display_value: `Stage ${n}`,
    sequence_number: n,
    actual_value: `Stage ${n}`,
    id,
    forecast_type: 'Open',
  }
}

function pipeline(id: string) {
  return {
    display_value: `Pipeline ${id}`,
    default: false,
    maps: [stage(`S${id}`, 1)],
    actual_value: `Pipeline ${id}`,
    id,
  }
}

/**
 * Fake upstream honouring only the documented parameters: `module` on
 * layouts (400 without it), `layout_id` on pipelines (400 without it, 204 for
 * a layout with no pipeline), and no paging on either.
 */
function serve(pipelinesByLayout: Record<string, string[]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      requests.push(url)
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Zoho-oauthtoken tok')
      if (url.pathname === `${BASE}/settings/layouts`) {
        if (url.searchParams.get('module') !== 'Deals')
          return new Response('REQUIRED_PARAM_MISSING', { status: 400 })
        const layouts = Object.keys(pipelinesByLayout).map((id) => ({
          id,
          name: `Layout ${id}`,
          status: 'active',
        }))
        return Response.json({ layouts })
      }
      if (url.pathname === `${BASE}/settings/pipeline`) {
        const layoutId = url.searchParams.get('layout_id')
        if (!layoutId) return new Response('REQUIRED_PARAM_MISSING', { status: 400 })
        if (url.searchParams.has('module'))
          return new Response('undocumented module', { status: 400 })
        const ids = pipelinesByLayout[layoutId]
        if (ids === undefined) return new Response('INVALID_DATA', { status: 400 })
        if (ids.length === 0) return new Response(null, { status: 204 })
        return Response.json({ pipeline: ids.map(pipeline) })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('zoho-crm listPipelines', () => {
  it("reads the Deals layouts, then each layout's pipelines by layout_id", async () => {
    serve({ L1: ['P1', 'P2'], L2: ['P3'] })
    const rows = await new ZohoCrmAdapter().listPipelines(creds, { page: 1, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['P1', 'P2', 'P3'])
    expect(requests.map((u) => `${u.pathname}?${u.searchParams.toString()}`)).toEqual([
      `${BASE}/settings/layouts?module=Deals`,
      `${BASE}/settings/pipeline?layout_id=L1`,
      `${BASE}/settings/pipeline?layout_id=L2`,
    ])
    for (const r of rows) PipelineSchema.parse(r)
    expect(rows[0]!.stages).toEqual([{ id: 'SP1', name: 'Stage 1', order: 0 }])
  })

  it('skips a layout that answers 204 (no pipeline in that layout)', async () => {
    serve({ L1: [], L2: ['P1'] })
    const rows = await new ZohoCrmAdapter().listPipelines(creds, { page: 1, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['P1'])
  })

  it('sends no paging params upstream', async () => {
    serve({ L1: ['P1', 'P2', 'P3'] })
    await new ZohoCrmAdapter().listPipelines(creds, withPageSink({ page: 2, limit: 1 }))
    for (const u of requests) {
      for (const key of ['page', 'per_page', 'limit', 'page_token'])
        expect(u.searchParams.has(key)).toBe(false)
    }
  })

  it('serves 2L+1 pipelines across pages 1..3, each once, with exact hasMore', async () => {
    const L = 3
    // Uneven split across layouts: 2 + 0 + 4 + 1 = 7 = 2L+1.
    serve({ L1: ['P1', 'P2'], L2: [], L3: ['P3', 'P4', 'P5', 'P6'], L4: ['P7'] })
    const adapter = new ZohoCrmAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listPipelines(creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'])
    expect(new Set(seen).size).toBe(7)
    expect(hasMore).toEqual([true, true, false])
  })

  it('gives the right meta through parseListQuery then listPage', async () => {
    serve({ L1: ['P1', 'P2', 'P3', 'P4'], L2: ['P5', 'P6', 'P7'] })
    const params = parseListQuery({ page: '2', limit: '3' })
    const rows = await new ZohoCrmAdapter().listPipelines(creds, params)
    const out = listPage(rows, params, 'zoho-crm')
    expect(out.data.map((r) => r.id)).toEqual(['P4', 'P5', 'P6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })
})

describe('zoho-crm getPipeline', () => {
  it('finds a pipeline in any Deals layout, reading each by layout_id', async () => {
    serve({ L1: ['P1'], L2: ['P2'] })
    const p = await new ZohoCrmAdapter().getPipeline(creds, 'P2')
    expect(PipelineSchema.parse(p).id).toBe('P2')
    expect(
      requests.every(
        (u) => u.pathname !== `${BASE}/settings/pipeline` || u.searchParams.has('layout_id'),
      ),
    ).toBe(true)
  })

  it('404s for an id in no layout', async () => {
    serve({ L1: ['P1'] })
    await expect(new ZohoCrmAdapter().getPipeline(creds, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('zoho-crm default scopes', () => {
  it('requests the layouts scope listPipelines needs', () => {
    const url = new URL(
      new ZohoCrmAdapter({ clientId: 'c', redirectUri: 'https://x/cb' }).getAuthUrl('s'),
    )
    expect(url.searchParams.get('scope')?.split(',')).toContain('ZohoCRM.settings.layouts.READ')
  })
})
