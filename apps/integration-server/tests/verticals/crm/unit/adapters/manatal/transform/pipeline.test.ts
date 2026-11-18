import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawManatalPipeline,
} from '../../../../../../../src/verticals/crm/adapters/manatal/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawManatalPipeline> = {}): RawManatalPipeline {
  return { id: 1, ...overrides }
}

describe('manatal transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 3 })).id).toBe('3')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Engineering Hiring' })).name).toBe(
      'Engineering Hiring',
    )
  })

  it('maps stages with id, name, and order', () => {
    const raw = makeRaw({
      stages: [
        { id: 10, name: 'Applied', order: 1 },
        { id: 11, name: 'Interview', order: 2 },
      ],
    })
    const result = transformPipeline(raw)
    expect(result.stages).toHaveLength(2)
    expect(result.stages![0].id).toBe('10')
    expect(result.stages![0].name).toBe('Applied')
    expect(result.stages![0].order).toBe(1)
    expect(result.stages![1].name).toBe('Interview')
  })

  it('defaults stages to empty array when not provided', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('passes PipelineSchema validation', () => {
    const raw: RawManatalPipeline = {
      id: 1,
      name: 'Tech Hiring',
      stages: [
        { id: 10, name: 'Screening', order: 0 },
        { id: 11, name: 'Offer', order: 1 },
      ],
    }
    const result = transformPipeline(raw)
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
