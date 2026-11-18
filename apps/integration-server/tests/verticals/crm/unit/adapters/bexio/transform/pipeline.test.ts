import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawBexioPipeline } from '../../../../../../../src/verticals/crm/adapters/bexio/transform/pipeline'

function makeRaw(overrides: Partial<RawBexioPipeline> = {}): RawBexioPipeline {
  return { ...overrides }
}

describe('bexio transformPipeline', () => {
  it('returns a pipeline with empty id and name', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('')
    expect(result.name).toBe('')
  })

  it('returns empty stages array', () => {
    const result = transformPipeline(makeRaw())
    expect(result.stages).toEqual([])
  })

  it('is_active is true', () => {
    const result = transformPipeline(makeRaw())
    expect(result.is_active).toBe(true)
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
