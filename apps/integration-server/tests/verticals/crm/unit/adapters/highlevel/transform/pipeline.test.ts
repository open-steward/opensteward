import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawHighLevelPipeline,
} from '../../../../../../../src/verticals/crm/adapters/highlevel/transform/pipeline'

function makeRaw(overrides: Partial<RawHighLevelPipeline> = {}): RawHighLevelPipeline {
  return { id: 'p-1', ...overrides }
}

describe('highlevel transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw({ id: 'p-1' })).id).toBe('p-1')
  })

  it('defaults name to empty string', () => {
    expect(transformPipeline(makeRaw()).name).toBe('')
  })

  it('maps stages', () => {
    const result = transformPipeline(makeRaw({
      name: 'Pipeline',
      stages: [{ id: 's-1', name: 'Lead', position: 0 }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('s-1')
    expect(result.stages?.[0].name).toBe('Lead')
  })

  it('defaults stages to empty array', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 'p-1' }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
