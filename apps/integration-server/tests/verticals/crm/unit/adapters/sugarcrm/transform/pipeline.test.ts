import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawSugarSalesStageEnum } from '../../../../../../../src/verticals/crm/adapters/sugarcrm/transform/pipeline'

function makeRaw(overrides: Partial<RawSugarSalesStageEnum> = {}): RawSugarSalesStageEnum {
  return { values: { Prospecting: 'Prospecting', Qualification: 'Qualification' }, ...overrides }
}

describe('sugarcrm transformPipeline', () => {
  it('returns a pipeline with id "default"', () => {
    expect(transformPipeline(makeRaw()).id).toBe('default')
  })

  it('maps values object to stages', () => {
    const pipeline = transformPipeline(makeRaw())
    expect(pipeline.stages).toHaveLength(2)
    expect(pipeline.stages?.[0]?.id).toBe('Prospecting')
    expect(pipeline.stages?.[0]?.name).toBe('Prospecting')
  })

  it('handles empty values gracefully', () => {
    expect(transformPipeline({ values: {} }).stages).toHaveLength(0)
  })

  it('is always active', () => {
    expect(transformPipeline(makeRaw()).is_active).toBe(true)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw())
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
