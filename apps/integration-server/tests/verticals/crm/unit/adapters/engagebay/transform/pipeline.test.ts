import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawEngageBayTrack,
} from '../../../../../../../src/verticals/crm/adapters/engagebay/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawEngageBayTrack> = {}): RawEngageBayTrack {
  return { id: 1, ...overrides }
}

describe('engagebay transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name field', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales' })).name).toBe('Sales')
  })

  it('falls back to empty string when name absent', () => {
    expect(transformPipeline(makeRaw()).name).toBe('')
  })

  it('maps milestones to stages', () => {
    const raw = makeRaw({
      milestones: [{ id: 10, name: 'Prospecting', probability: 20, display_order: 0 }],
    })
    const result = transformPipeline(raw)
    expect(result.stages).toHaveLength(1)
    expect(result.stages![0].id).toBe('10')
    expect(result.stages![0].name).toBe('Prospecting')
    expect(result.stages![0].win_probability).toBe(20)
    expect(result.stages![0].order).toBe(0)
  })

  it('uses index as fallback order when display_order absent', () => {
    const raw = makeRaw({
      milestones: [{ name: 'Stage A' }, { name: 'Stage B' }],
    })
    const stages = transformPipeline(raw).stages!
    expect(stages[0].order).toBe(0)
    expect(stages[1].order).toBe(1)
  })

  it('uses index as fallback id when milestone id absent', () => {
    const raw = makeRaw({ milestones: [{ name: 'Stage A' }] })
    expect(transformPipeline(raw).stages![0].id).toBe('0')
  })

  it('sets stages to undefined when milestones empty', () => {
    expect(transformPipeline(makeRaw({ milestones: [] })).stages).toBeUndefined()
  })

  it('converts epoch ms timestamps to ISO datetime', () => {
    const raw = makeRaw({ created_time: 1699000000000, updated_time: 1700000000000 })
    const result = transformPipeline(raw)
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('passes PipelineSchema validation with full input', () => {
    const raw: RawEngageBayTrack = {
      id: 5,
      name: 'Sales Pipeline',
      milestones: [
        { id: 10, name: 'Prospecting', probability: 20, display_order: 0 },
        { id: 11, name: 'Negotiation', probability: 60, display_order: 1 },
      ],
      created_time: 1699000000000,
      updated_time: 1700000000000,
    }
    const result = transformPipeline(raw)
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
