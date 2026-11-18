/**
 * EspoCRM listPipelines: GET Pipeline (v10.0+, docs.espocrm.com/general/pipelines/)
 * filtered to Opportunity pipelines, each with its stages from
 * GET Pipeline/{id}/stages. There is no OpportunityStage entity type; the old
 * call 404'd everywhere and reported "no pipelines".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { EspoCrmAdapter } from '../../../../../../src/verticals/crm/adapters/espocrm'
import { CREDS, fakeEspo, MAX } from './fake-espocrm'

afterEach(() => vi.restoreAllMocks())

function pipeline(i: number, entityType = 'Opportunity'): Record<string, unknown> {
  return {
    id: `${entityType === 'Opportunity' ? 'op' : 'ld'}${i}`,
    name: `${entityType} pipeline ${i}`,
    order: i,
    status: 'Active',
    entityType,
    field: entityType === 'Opportunity' ? 'stage' : 'status',
    createdAt: '2026-01-02 03:04:05',
    modifiedAt: '2026-01-02 03:04:05',
  }
}

function stagesFor(id: string, n: number): Record<string, unknown>[] {
  // Stored out of order so only orderBy=order returns them in pipeline order.
  return Array.from({ length: n }, (_, i) => ({
    id: `${id}-s${n - i}`,
    name: `Stage ${n - i}`,
    order: n - i,
    mappedStatus: 'Prospecting',
    pipelineId: id,
  }))
}

/** 2L+1 Opportunity pipelines, with Lead pipelines interleaved that must be filtered out upstream. */
function seed(opportunities: number) {
  const Pipeline: Record<string, unknown>[] = []
  const stages: Record<string, Record<string, unknown>[]> = {}
  for (let i = 1; i <= opportunities; i++) {
    Pipeline.push(pipeline(i))
    stages[`op${i}`] = stagesFor(`op${i}`, 3)
    if (i % 2 === 0) Pipeline.push(pipeline(i, 'Lead'))
  }
  return { entities: { Pipeline }, stages }
}

async function page(adapter: EspoCrmAdapter, p: number, limit: number) {
  const params: QueryParams = withPageSink({ page: p, limit })
  const rows = await adapter.listPipelines(CREDS, params)
  return { rows, meta: readUpstreamPage(params) }
}

describe('EspoCRM listPipelines — request shape', () => {
  it('sends only documented search params, filtered to Opportunity pipelines', async () => {
    const fake = fakeEspo(seed(1))
    await new EspoCrmAdapter().listPipelines(CREDS, withPageSink({ page: 3, limit: 7 }))
    const list = fake.sent.find((u) => u.pathname === '/api/v1/Pipeline')!
    expect([...list.searchParams.keys()]).toEqual(['searchParams'])
    expect(JSON.parse(list.searchParams.get('searchParams')!)).toEqual({
      offset: 14,
      maxSize: 7,
      where: [{ type: 'equals', attribute: 'entityType', value: 'Opportunity' }],
    })
  })

  it('never calls the non-existent OpportunityStage entity', async () => {
    const fake = fakeEspo(seed(2))
    await new EspoCrmAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(fake.sent.some((u) => u.pathname.includes('OpportunityStage'))).toBe(false)
  })

  it('reads each pipeline’s stages through the documented related-records list, in order', async () => {
    const fake = fakeEspo(seed(1))
    const [p] = await new EspoCrmAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    const stageCall = fake.sent.find((u) => u.pathname === '/api/v1/Pipeline/op1/stages')!
    expect(Object.fromEntries(stageCall.searchParams)).toEqual({
      offset: '0',
      maxSize: String(MAX),
      orderBy: 'order',
      order: 'asc',
    })
    expect(PipelineSchema.parse(p).stages).toEqual([
      { id: 'op1-s1', name: 'Stage 1', order: 0 },
      { id: 'op1-s2', name: 'Stage 2', order: 1 },
      { id: 'op1-s3', name: 'Stage 3', order: 2 },
    ])
  })

  it('walks every stage page when a pipeline has more than 200 stages', async () => {
    const data = seed(1)
    data.stages['op1'] = stagesFor('op1', 2 * MAX + 50)
    const fake = fakeEspo(data)
    const [p] = await new EspoCrmAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(p!.stages).toHaveLength(2 * MAX + 50)
    expect(new Set(p!.stages!.map((s) => s.id)).size).toBe(2 * MAX + 50)
    expect(fake.sent.filter((u) => u.pathname.endsWith('/stages'))).toHaveLength(3)
  })

  it('walks stages by -1/-2 when the record count is disabled', async () => {
    const data = seed(1)
    data.stages['op1'] = stagesFor('op1', MAX + 1)
    fakeEspo(data, { total: 'minus' })
    const [p] = await new EspoCrmAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(p!.stages).toHaveLength(MAX + 1)
  })

  it('clamps a direct call past 200 to maxSize 200 and reports the size sent', async () => {
    const fake = fakeEspo(seed(1))
    const { meta } = await page(new EspoCrmAdapter(), 2, 500)
    const list = fake.sent.find((u) => u.pathname === '/api/v1/Pipeline')!
    expect(JSON.parse(list.searchParams.get('searchParams')!)).toMatchObject({
      offset: MAX,
      maxSize: MAX,
    })
    expect(meta?.pageSize).toBe(MAX)
  })

  it('declares the documented page maximum', () => {
    expect(new EspoCrmAdapter().capabilities.maxPageSize).toBe(MAX)
  })
})

describe('EspoCRM listPipelines — paging walk', () => {
  const L = 2
  const N = 2 * L + 1

  for (const mode of ['count', 'minus'] as const) {
    it(`serves each of ${N} pipelines once with exact hasMore (total ${mode})`, async () => {
      fakeEspo(seed(N), { total: mode })
      const adapter = new EspoCrmAdapter()
      const seen: string[] = []
      const more: (boolean | undefined)[] = []
      for (let p = 1; p <= 4; p++) {
        const { rows, meta } = await page(adapter, p, L)
        seen.push(...rows.map((r) => PipelineSchema.parse(r).id))
        more.push(meta?.hasMore)
      }
      expect(seen).toEqual(['op1', 'op2', 'op3', 'op4', 'op5'])
      expect(more).toEqual([true, true, false, false])
    })
  }

  it('reports totalCount from EspoCRM’s total', async () => {
    fakeEspo(seed(N))
    const { meta } = await page(new EspoCrmAdapter(), 1, L)
    expect(meta).toMatchObject({ totalCount: N, hasMore: true })
  })
})

describe('EspoCRM listPipelines — errors', () => {
  for (const status of [401, 403, 404, 500]) {
    it(`propagates ${status} instead of reporting "no pipelines"`, async () => {
      fakeEspo(seed(1), { status })
      await expect(
        new EspoCrmAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 })),
      ).rejects.toMatchObject({ statusCode: status })
    })
  }
})

describe('EspoCRM listPipelines — malformed or empty upstream pages', () => {
  function respond(route: (url: URL) => unknown) {
    const sent: URL[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      sent.push(url)
      if (sent.length > 10) throw new Error('test: runaway request loop')
      return new Response(JSON.stringify(route(url)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    return sent
  }

  it('stops the stage walk on an empty page even when total says -1 ("there are more records")', async () => {
    const sent = respond((url) =>
      url.pathname.endsWith('/stages')
        ? { list: [], total: -1 }
        : { list: [{ id: 'op1', name: 'Sales', status: 'Active' }], total: 1 },
    )
    const [p] = await new EspoCrmAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(PipelineSchema.parse(p).stages).toEqual([])
    expect(sent.filter((u) => u.pathname.endsWith('/stages'))).toHaveLength(1)
  })

  it('rejects a response without the documented "list" array instead of reading it as empty', async () => {
    respond(() => ({ total: 0 }))
    await expect(
      new EspoCrmAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/no "list" array/)
  })
})
