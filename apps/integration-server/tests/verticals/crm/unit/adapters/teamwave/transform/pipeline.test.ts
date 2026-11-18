import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawTeamwavePipeline } from '../../../../../../../src/verticals/crm/adapters/teamwave/transform/pipeline'

function makeRaw(overrides: Partial<RawTeamwavePipeline> = {}): RawTeamwavePipeline {
  return { id: 1, name: 'TW Pipeline', ...overrides }
}

describe('teamwave transformPipeline', () => {
  it('maps id and name', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('1')
    expect(result.name).toBe('TW Pipeline')
  })

  it('maps stages with win_probability', () => {
    const pipeline = transformPipeline(makeRaw({ stages: [{ id: 10, name: 'Lead', win_probability: 20 }] }))
    expect(pipeline.stages?.[0]?.id).toBe('10')
    expect(pipeline.stages?.[0]?.win_probability).toBe(20)
  })

  it('defaults is_active to true when not specified', () => {
    expect(transformPipeline(makeRaw()).is_active).toBe(true)
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
