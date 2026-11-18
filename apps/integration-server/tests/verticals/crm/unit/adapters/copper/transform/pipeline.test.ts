import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawCopperPipeline } from '../../../../../../../src/verticals/crm/adapters/copper/transform/pipeline'

function makeRaw(overrides: Partial<RawCopperPipeline> = {}): RawCopperPipeline {
  return { id: 1, name: 'Sales', ...overrides }
}

describe('copper transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales')
  })

  it('maps stages array', () => {
    const result = transformPipeline(makeRaw({ stages: [{ id: 10, name: 'Qualified', win_probability: 30 }] }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].win_probability).toBe(30)
  })

  it('defaults to empty stages', () => {
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
