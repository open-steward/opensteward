import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawCreatioStage } from '../../../../../../../src/verticals/crm/adapters/creatio/transform/pipeline'

function makeStage(overrides: Partial<RawCreatioStage> = {}): RawCreatioStage {
  return { Id: 's1', Name: 'Qualify', ...overrides }
}

describe('creatio transformPipeline', () => {
  it('synthesises default id', () => {
    expect(transformPipeline([]).id).toBe('default')
  })

  it('maps stages from RawCreatioStage array', () => {
    const result = transformPipeline([makeStage({ Id: 'x', Name: 'Close', Number: 5 })])
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('x')
    expect(result.stages?.[0].name).toBe('Close')
    expect(result.stages?.[0].order).toBe(5)
  })

  it('handles empty stages array', () => {
    expect(transformPipeline([]).stages).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline([])
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
