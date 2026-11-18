import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformSegmentAsPipeline, type RawMauticSegment } from '../../../../../../../src/verticals/crm/adapters/mautic/transform/pipeline'

function makeRaw(overrides: Partial<RawMauticSegment> = {}): RawMauticSegment {
  return { id: '1', ...overrides }
}

describe('mautic transformSegmentAsPipeline', () => {
  it('maps id', () => {
    const result = transformSegmentAsPipeline(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name', () => {
    const result = transformSegmentAsPipeline(makeRaw({ name: 'Segment A' }))
    expect(result.name).toBe('Segment A')
  })

  it('maps is_active from isPublished', () => {
    const result = transformSegmentAsPipeline(makeRaw({ isPublished: false }))
    expect(result.is_active).toBe(false)
  })

  it('defaults is_active to true when isPublished is not false', () => {
    const result = transformSegmentAsPipeline(makeRaw())
    expect(result.is_active).toBe(true)
  })

  it('creates a single stage matching the segment', () => {
    const result = transformSegmentAsPipeline(makeRaw({ id: '1', name: 'Segment A' }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('1')
    expect(result.stages?.[0].name).toBe('Segment A')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformSegmentAsPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformSegmentAsPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSegmentAsPipeline(makeRaw())
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
