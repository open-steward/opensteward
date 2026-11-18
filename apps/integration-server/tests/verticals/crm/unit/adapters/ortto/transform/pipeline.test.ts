import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawOrttoPipeline,
} from '../../../../../../../src/verticals/crm/adapters/ortto/transform/pipeline'

function makeRaw(overrides: Partial<RawOrttoPipeline> = {}): RawOrttoPipeline {
  return { id: 'p-1', ...overrides }
}

describe('ortto transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 'p-5' })).id).toBe('p-5')
  })

  it('returns empty stages array (stub behaviour)', () => {
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
    const result = transformPipeline(makeRaw({ id: 'p-5' }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
