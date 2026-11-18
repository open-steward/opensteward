import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawWakeupsalesPipeline } from '../../../../../../../src/verticals/crm/adapters/wakeupsales/transform/pipeline'

function makeRaw(overrides: Partial<RawWakeupsalesPipeline> = {}): RawWakeupsalesPipeline {
  return { id: '1', name: 'Default', ...overrides }
}

describe('wakeupsales transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw()).id).toBe('1')
  })

  it('maps is_active from boolean', () => {
    expect(transformPipeline(makeRaw({ is_active: true })).is_active).toBe(true)
    expect(transformPipeline(makeRaw({ is_active: false })).is_active).toBe(false)
  })

  it('maps stages with win_probability', () => {
    const pipeline = transformPipeline(makeRaw({ stages: [{ id: '5', name: 'Lead', probability: 30 }] }))
    expect(pipeline.stages?.[0]?.id).toBe('5')
    expect(pipeline.stages?.[0]?.win_probability).toBe(30)
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
