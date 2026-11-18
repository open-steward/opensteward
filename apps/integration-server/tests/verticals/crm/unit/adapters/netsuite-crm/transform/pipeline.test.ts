import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawNetsuitePipeline } from '../../../../../../../src/verticals/crm/adapters/netsuite-crm/transform/pipeline'

function makeRaw(overrides: Partial<RawNetsuitePipeline> = {}): RawNetsuitePipeline {
  return { id: '1', ...overrides }
}

describe('netsuite-crm transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('1')
  })

  it('returns empty stages (stub)', () => {
    expect(transformPipeline(makeRaw()).stages).toHaveLength(0)
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
