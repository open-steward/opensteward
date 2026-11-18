import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawFollowUpBossPipeline,
} from '../../../../../../../src/verticals/crm/adapters/follow-up-boss/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawFollowUpBossPipeline> = {}): RawFollowUpBossPipeline {
  return { id: 1, ...overrides }
}

describe('follow-up-boss transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name field', () => {
    expect(transformPipeline(makeRaw({ name: 'Residential Sales' })).name).toBe('Residential Sales')
  })

  it('falls back to empty string when name absent', () => {
    expect(transformPipeline(makeRaw()).name).toBe('')
  })

  it('does not emit stages (FUB pipelines have no stages in wire format)', () => {
    // FUB pipeline wire only has id + name; stages are absent from the canonical output
    expect(transformPipeline(makeRaw()).stages).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('passes PipelineSchema validation', () => {
    const raw: RawFollowUpBossPipeline = { id: 5, name: 'Residential Sales' }
    const result = transformPipeline(raw)
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
