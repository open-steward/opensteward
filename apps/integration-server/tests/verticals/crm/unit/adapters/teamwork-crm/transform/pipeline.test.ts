import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawTeamworkPipeline,
  type RawTeamworkStage,
} from '../../../../../../../src/verticals/crm/adapters/teamwork-crm/transform/pipeline'
import { PIPELINE, STAGES } from '../fixtures'

const stages = STAGES as RawTeamworkStage[]

describe('teamwork-crm transformPipeline', () => {
  it('maps the documented Pipeline model and its side-loaded stages', () => {
    const raw = { ...PIPELINE } as RawTeamworkPipeline
    const pipeline = PipelineSchema.parse(transformPipeline(raw, stages))
    expect(pipeline).toMatchObject({
      id: '12',
      name: 'Sales',
      created_at: '2020-03-02T09:15:00Z',
      updated_at: '2020-06-10T16:40:00Z',
    })
    // Ordered by orderIndex (72 → 4, 73 → 5), not by the relationship array's order.
    expect(pipeline.stages).toEqual([
      { id: '72', name: 'Qualified', order: 0, win_probability: 20 },
      { id: '73', name: 'Proposal sent', order: 1, win_probability: 60 },
    ])
    expect(pipeline.is_active).toBeUndefined()
    expect(transformPipeline(raw, stages).metadata).toBe(raw)
  })

  it('omits stages when the relationship came back short of stagesCount', () => {
    const raw = { ...PIPELINE, stagesCount: 3 } as RawTeamworkPipeline
    expect(PipelineSchema.parse(transformPipeline(raw, stages)).stages).toBeUndefined()
  })

  it('omits stages when a stage was not side-loaded', () => {
    const raw = { ...PIPELINE } as RawTeamworkPipeline
    expect(transformPipeline(raw, [stages[0]]).stages).toBeUndefined()
    expect(transformPipeline(raw).stages).toBeUndefined()
  })

  it('omits stages when a side-loaded stage has no orderIndex to sort by', () => {
    const raw = { ...PIPELINE } as RawTeamworkPipeline
    const unordered = [stages[0], { ...stages[1], orderIndex: null }]
    expect(transformPipeline(raw, unordered).stages).toBeUndefined()
  })

  it('leaves win_probability absent when probability is not a 0..100 percentage', () => {
    const raw = { ...PIPELINE } as RawTeamworkPipeline
    const odd = [
      { ...stages[0], probability: 150 },
      { ...stages[1], probability: -5 },
    ]
    const pipeline = PipelineSchema.parse(transformPipeline(raw, odd))
    expect(pipeline.stages?.map((s) => s.win_probability)).toEqual([undefined, undefined])
  })

  it('maps an empty pipeline to an empty stage list', () => {
    const raw = { ...PIPELINE, stages: [], stagesCount: 0 } as RawTeamworkPipeline
    expect(PipelineSchema.parse(transformPipeline(raw, stages)).stages).toEqual([])
  })

  it('refuses a model without a name', () => {
    expect(() =>
      transformPipeline({ ...PIPELINE, name: null } as unknown as RawTeamworkPipeline),
    ).toThrow(/no name/)
  })
})
