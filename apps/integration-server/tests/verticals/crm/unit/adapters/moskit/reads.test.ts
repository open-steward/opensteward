/**
 * Moskit reads by id, on the documented paths and host
 * (https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/reference/openapi.yaml):
 *   GET /contacts/{id}   "Busca contato pelo ID"
 *   GET /companies/{id}  "Busca de empresa"
 *   GET /deals/{id}      "Busca negócio pelo ID"
 *   GET /activities/{id} "Busca atividade pelo ID"
 *   GET /pipelines/{id}  "Busca funil do negócio pelo ID"
 *   GET /stages          "Lista de fases dos negócios" (Stage.pipeline names the funnel)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { MoskitAdapter } from '../../../../../../src/verticals/crm/adapters/moskit/index'
import { CREDS, HOST, fakeMoskit, rows } from './fake-moskit'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('moskit get*', () => {
  it.each([
    ['getContact', 'contacts'],
    ['getCompany', 'companies'],
    ['getDeal', 'deals'],
    ['getActivity', 'activities'],
  ] as const)('%s reads GET /v2/%s/{id}', async (method, coll) => {
    const { sent } = fakeMoskit({ [coll]: rows(3) })
    const out = await new MoskitAdapter()[method](CREDS, '2')
    expect(out.id).toBe('2')
    expect(sent.map((u) => `${u.host}${u.pathname}`)).toEqual([`${HOST}/v2/${coll}/2`])
  })

  it('getContact no longer calls the undocumented /people', async () => {
    const { sent } = fakeMoskit({ contacts: [{ id: 5, name: 'Maria' }] })
    expect((await new MoskitAdapter().getContact(CREDS, '5')).name).toBe('Maria')
    expect(sent.some((u) => u.pathname.includes('/people'))).toBe(false)
  })
})

describe('moskit pipelines and stages', () => {
  const PIPELINES = [
    { id: 1, name: 'Vendas' },
    { id: 2, name: 'Renovação' },
  ]
  // 55 stages: more than one /stages page of 50, so the join walks both.
  const STAGES = Array.from({ length: 55 }, (_, i) => ({
    id: 100 + i,
    name: `Fase ${i}`,
    pipeline: { id: i % 2 === 0 ? 1 : 2 },
  }))

  it('listPipelines joins every stage from GET /stages to its pipeline', async () => {
    const { sent } = fakeMoskit({ pipelines: PIPELINES, stages: STAGES })
    const out = await new MoskitAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(out.map((p) => p.id)).toEqual(['1', '2'])
    expect(out[0]!.stages!.map((s) => s.id)).toEqual(
      STAGES.filter((s) => s.pipeline.id === 1).map((s) => String(s.id)),
    )
    expect(out[1]!.stages!.map((s) => s.id)).toEqual(
      STAGES.filter((s) => s.pipeline.id === 2).map((s) => String(s.id)),
    )
    expect(sent.some((u) => u.pathname.includes('funnels'))).toBe(false)
    const stageReqs = sent.filter((u) => u.pathname === '/v2/stages')
    expect(stageReqs.map((u) => u.searchParams.get('start'))).toEqual(['0', '50'])
  })

  it('listPipelines walks /stages to a short page when the total header is absent', async () => {
    const { sent } = fakeMoskit(
      { pipelines: PIPELINES, stages: STAGES },
      {},
      { totalHeader: () => null },
    )
    const out = await new MoskitAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(out.flatMap((p) => p.stages ?? [])).toHaveLength(55)
    const stageReqs = sent.filter((u) => u.pathname === '/v2/stages')
    expect(stageReqs.map((u) => u.searchParams.get('start'))).toEqual(['0', '50'])
  })

  it('listPipelines sends no /stages request for an empty page', async () => {
    const { sent } = fakeMoskit({ pipelines: [], stages: STAGES })
    const out = await new MoskitAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(out).toEqual([])
    expect(sent.map((u) => u.pathname)).toEqual(['/v2/pipelines'])
  })

  it('listPipelines no longer hides an upstream 404 as an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }))
    await expect(
      new MoskitAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getPipeline reads GET /v2/pipelines/{id} with its stages', async () => {
    const { sent } = fakeMoskit({ pipelines: PIPELINES, stages: STAGES })
    const out = await new MoskitAdapter().getPipeline(CREDS, '2')
    expect(out.name).toBe('Renovação')
    expect(out.stages).toHaveLength(27)
    expect(sent[0]!.pathname).toBe('/v2/pipelines/2')
  })
})
