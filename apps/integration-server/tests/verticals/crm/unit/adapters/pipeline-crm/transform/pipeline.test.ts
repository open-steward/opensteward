import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawPipelineCrmDealPipeline,
  type RawPipelineCrmDealStage,
} from '../../../../../../../src/verticals/crm/adapters/pipeline-crm/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

// Fixtures follow the documented shapes in https://app.pipelinecrm.com/openapi.json:
// DealPipelineAll (id, name, default, pipeline_type, description, created_at,
// updated_at, has_deals, count_deals, won_stage, lost_stage) and DealStageAll
// (id, created_at, updated_at, name, percent, deal_pipeline_id). The spec's own
// example values are used where it gives one (`3`, `New Business`, `sales`, `42`;
// `Proposal`, `45`). The rest are chosen for the test: the spec gives no example
// for a stage id or the timestamps, and deal_pipeline_id is `3` (not the spec's
// `1`) so the stage belongs to the fixture pipeline.
function makePipeline(
  overrides: Partial<RawPipelineCrmDealPipeline> = {},
): RawPipelineCrmDealPipeline {
  return {
    id: 3,
    name: 'New Business',
    default: true,
    pipeline_type: 'sales',
    description: null,
    created_at: '2026-01-15 09:30:00',
    updated_at: '2026-02-01 14:20:00',
    has_deals: true,
    count_deals: 42,
    won_stage: null,
    lost_stage: null,
    ...overrides,
  }
}

function makeStage(overrides: Partial<RawPipelineCrmDealStage> = {}): RawPipelineCrmDealStage {
  return {
    id: 12,
    created_at: '2026-01-15 09:30:00',
    updated_at: '2026-02-01 14:20:00',
    name: 'Proposal',
    percent: 45,
    deal_pipeline_id: 3,
    ...overrides,
  }
}

describe('pipeline-crm transformPipeline', () => {
  it('parses against PipelineSchema', () => {
    const out = PipelineSchema.parse(transformPipeline(makePipeline(), [makeStage()]))
    expect(out).toMatchObject({
      id: '3',
      name: 'New Business',
      stages: [{ id: '12', name: 'Proposal', win_probability: 45 }],
    })
  })

  it('maps the documented percent to win_probability', () => {
    const out = transformPipeline(makePipeline(), [makeStage({ percent: 70 })])
    expect(out.stages![0].win_probability).toBe(70)
  })

  it('omits win_probability when percent is null (documented nullable)', () => {
    const out = PipelineSchema.parse(
      transformPipeline(makePipeline(), [makeStage({ percent: null })]),
    )
    expect(out.stages![0]).not.toHaveProperty('win_probability')
  })

  it('keeps the stages in the order given', () => {
    const out = transformPipeline(makePipeline(), [
      makeStage({ id: 14, name: 'Won' }),
      makeStage({ id: 12, name: 'Proposal' }),
    ])
    expect(out.stages!.map((s) => s.id)).toEqual(['14', '12'])
  })

  it('returns an empty stage list for a pipeline with no stages', () => {
    expect(transformPipeline(makePipeline(), []).stages).toEqual([])
  })

  it('does not publish the zoneless user-time-zone timestamps as ISO', () => {
    const out = transformPipeline(makePipeline(), [])
    expect(out).not.toHaveProperty('created_at')
    expect(out).not.toHaveProperty('updated_at')
  })

  it('throws rather than inventing a pipeline name', () => {
    expect(() => transformPipeline(makePipeline({ name: undefined }), [])).toThrow(/name/)
  })

  it('throws rather than inventing a stage name', () => {
    expect(() => transformPipeline(makePipeline(), [makeStage({ name: undefined })])).toThrow(
      /name/,
    )
  })

  it('preserves the raw pipeline as metadata', () => {
    const raw = makePipeline()
    expect(transformPipeline(raw, []).metadata).toBe(raw)
  })
})
