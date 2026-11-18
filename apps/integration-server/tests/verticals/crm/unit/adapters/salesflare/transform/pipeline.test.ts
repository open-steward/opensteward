import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawSalesflarePipeline,
} from '../../../../../../../src/verticals/crm/adapters/salesflare/transform/pipeline'

function makeRaw(overrides: Partial<RawSalesflarePipeline> = {}): RawSalesflarePipeline {
  return { id: 1, name: 'Sales Pipeline', ...overrides }
}

describe('salesflare transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales Pipeline')
  })

  it('is always active', () => {
    expect(transformPipeline(makeRaw()).is_active).toBe(true)
  })

  it('maps stages', () => {
    const pipeline = transformPipeline(makeRaw({
      stages: [{ id: 1, name: 'Qualified', order: 1, probability: 30 }],
    }))
    expect(pipeline.stages).toHaveLength(1)
    expect(pipeline.stages?.[0]?.win_probability).toBe(30)
  })

  it('handles empty stages', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 5 }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
