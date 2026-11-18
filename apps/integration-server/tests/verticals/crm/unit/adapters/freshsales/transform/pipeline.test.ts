import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawFreshsalesPipeline,
} from '../../../../../../../src/verticals/crm/adapters/freshsales/transform/pipeline'

function makeRaw(overrides: Partial<RawFreshsalesPipeline> = {}): RawFreshsalesPipeline {
  return { id: 1, name: 'Sales', ...overrides }
}

describe('freshsales transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 1 })).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales')
  })

  it('maps deal_stages to stages', () => {
    const result = transformPipeline(makeRaw({
      deal_stages: [{ id: 10, name: 'Prospecting', position: 1 }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].name).toBe('Prospecting')
    expect(result.stages?.[0].order).toBe(1)
  })

  it('defaults stages to empty array when deal_stages missing', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 1 }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
