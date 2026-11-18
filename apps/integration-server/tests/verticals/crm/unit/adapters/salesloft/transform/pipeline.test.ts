import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawSalesloftStage } from '../../../../../../../src/verticals/crm/adapters/salesloft/transform/pipeline'

function makeStage(overrides: Partial<RawSalesloftStage> = {}): RawSalesloftStage {
  return { id: 1, name: 'Prospecting', ...overrides }
}

describe('salesloft transformPipeline', () => {
  it('returns a pipeline with id "default"', () => {
    expect(transformPipeline([makeStage()]).id).toBe('default')
  })

  it('maps stages to pipeline stages', () => {
    const pipeline = transformPipeline([makeStage({ id: 5, name: 'Qualify' })])
    expect(pipeline.stages?.[0]?.id).toBe('5')
    expect(pipeline.stages?.[0]?.name).toBe('Qualify')
  })

  it('handles empty stages array', () => {
    expect(transformPipeline([]).stages).toHaveLength(0)
  })

  it('is always active', () => {
    expect(transformPipeline([]).is_active).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline([makeStage()])
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
