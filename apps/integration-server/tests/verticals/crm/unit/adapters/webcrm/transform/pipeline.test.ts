import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawWebcrmPipeline } from '../../../../../../../src/verticals/crm/adapters/webcrm/transform/pipeline'

function makeRaw(overrides: Partial<RawWebcrmPipeline> = {}): RawWebcrmPipeline {
  return { ...overrides }
}

describe('webcrm transformPipeline', () => {
  it('maps id from PipelineId', () => {
    expect(transformPipeline(makeRaw({ PipelineId: 1 })).id).toBe('1')
  })

  it('maps name from PipelineName', () => {
    expect(transformPipeline(makeRaw({ PipelineName: 'Sales' })).name).toBe('Sales')
  })

  it('maps stages from Stages', () => {
    const raw = makeRaw({
      Stages: [{ PipelineStageId: 10, PipelineStageName: 'New', PipelineStageWinProbability: 20 }],
    })
    const result = transformPipeline(raw)
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].win_probability).toBe(20)
  })

  it('handles missing stages gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ PipelineId: 1 }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
