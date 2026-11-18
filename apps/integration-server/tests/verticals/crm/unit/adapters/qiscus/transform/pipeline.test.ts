import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/pipeline'
import type { RawQiscusPipeline } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/pipeline'

function makeRaw(overrides: Partial<RawQiscusPipeline> = {}): RawQiscusPipeline {
  return { id: '1', ...overrides }
}

describe('qiscus transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('1')
  })
  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Pipeline' })).name).toBe('Pipeline')
  })
  it('returns empty stages array', () => {
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
