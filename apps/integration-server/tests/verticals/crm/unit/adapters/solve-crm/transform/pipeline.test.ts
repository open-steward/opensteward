import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/pipeline'
import type { RawSolvePipeline } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/pipeline'

function makeRaw(overrides: Partial<RawSolvePipeline> = {}): RawSolvePipeline {
  return { id: '1', ...overrides }
}

describe('solve-crm transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('1')
  })
  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales' })).name).toBe('Sales')
  })
  it('returns empty stages', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
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
