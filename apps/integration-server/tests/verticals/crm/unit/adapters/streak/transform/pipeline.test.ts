import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawStreakPipeline } from '../../../../../../../src/verticals/crm/adapters/streak/transform/pipeline'

function makeRaw(overrides: Partial<RawStreakPipeline> = {}): RawStreakPipeline {
  return { key: 'pipe1', name: 'Sales', ...overrides }
}

describe('streak transformPipeline', () => {
  it('maps key to id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('pipe1')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales')
  })

  it('maps stages from Record object sorted by sortOrder', () => {
    const pipeline = transformPipeline(makeRaw({
      stages: {
        s2: { key: 's2', name: 'Stage 2', sortOrder: 2 },
        s1: { key: 's1', name: 'Stage 1', sortOrder: 1 },
      },
    }))
    expect(pipeline.stages?.[0]?.id).toBe('s1')
    expect(pipeline.stages?.[1]?.id).toBe('s2')
  })

  it('handles missing stages gracefully', () => {
    expect(transformPipeline(makeRaw()).stages).toHaveLength(0)
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
