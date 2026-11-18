import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/pipeline'
import type { RawOntraportPipeline } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/pipeline'

function makeRaw(overrides: Partial<RawOntraportPipeline> = {}): RawOntraportPipeline {
  return { id: '1', ...overrides }
}

describe('ontraport transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('1')
  })
  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales' })).name).toBe('Sales')
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
