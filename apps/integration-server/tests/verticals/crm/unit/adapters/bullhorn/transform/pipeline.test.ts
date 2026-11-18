import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawBullhornPipeline } from '../../../../../../../src/verticals/crm/adapters/bullhorn/transform/pipeline'

function makeRaw(overrides: Partial<RawBullhornPipeline> = {}): RawBullhornPipeline {
  return { id: 1, ...overrides }
}

describe('bullhorn transformPipeline', () => {
  it('maps id', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name', () => {
    const result = transformPipeline(makeRaw({ name: 'Default' }))
    expect(result.name).toBe('Default')
  })

  it('returns empty stages array', () => {
    const result = transformPipeline(makeRaw())
    expect(result.stages).toEqual([])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
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
