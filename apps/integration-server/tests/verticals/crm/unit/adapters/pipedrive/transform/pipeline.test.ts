import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawPipedrivePipeline,
  type RawPipedriveStage,
} from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/pipeline'

/**
 * Documented example items of GET /api/v2/pipelines (getPipelines) and
 * GET /api/v2/stages (getStages),
 * https://developers.pipedrive.com/docs/api/v2/openapi.yaml, verbatim.
 */
const pipelineExample: RawPipedrivePipeline = {
  id: 1,
  name: 'Pipeline Name',
  order_nr: 1,
  is_deleted: false,
  is_deal_probability_enabled: true,
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-01-01T00:00:00Z',
}
const stageExample: RawPipedriveStage = {
  id: 1,
  order_nr: 1,
  name: 'Stage Name',
  is_deleted: false,
  deal_probability: 100,
  pipeline_id: 1,
  is_deal_rot_enabled: true,
  days_to_rotten: 2,
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-01-01T00:00:00Z',
}

describe('pipedrive transformPipeline (API v2)', () => {
  it('maps the documented examples and satisfies PipelineSchema', () => {
    const out = PipelineSchema.parse(transformPipeline(pipelineExample, [stageExample]))
    expect(out).toMatchObject({
      id: '1',
      name: 'Pipeline Name',
      is_active: true,
      stages: [{ id: '1', name: 'Stage Name', order: 1, win_probability: 100 }],
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    })
    expect(out.metadata).toEqual(pipelineExample)
  })

  it('is_active is the negation of is_deleted (the migration guide: "replaces \\"active\\". NB: Negation of the old value.")', () => {
    expect(transformPipeline({ ...pipelineExample, is_deleted: true }, []).is_active).toBe(false)
    expect(transformPipeline({ ...pipelineExample, is_deleted: false }, []).is_active).toBe(true)
  })

  it('leaves is_active unknown when is_deleted is absent', () => {
    expect(transformPipeline({ id: 2, name: 'P' }, []).is_active).toBeUndefined()
  })

  it('keeps the stages it is given, in order', () => {
    const out = transformPipeline(pipelineExample, [
      { id: 10, name: 'Lead', order_nr: 0 },
      { id: 20, name: 'Won', order_nr: 1 },
    ])
    expect(out.stages?.map((s) => s.id)).toEqual(['10', '20'])
  })

  it('leaves out a stage marked as deleted ("Whether the stage is marked as deleted or not")', () => {
    const out = PipelineSchema.parse(
      transformPipeline(pipelineExample, [
        stageExample,
        { ...stageExample, id: 2, is_deleted: true },
        { ...stageExample, id: 3 },
      ]),
    )
    expect(out.stages?.map((s) => s.id)).toEqual(['1', '3'])
  })
})
