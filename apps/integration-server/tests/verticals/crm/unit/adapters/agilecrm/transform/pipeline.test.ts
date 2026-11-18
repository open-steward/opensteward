import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawAgileCrmPipeline } from '../../../../../../../src/verticals/crm/adapters/agilecrm/transform/pipeline'

function makeRaw(overrides: Partial<RawAgileCrmPipeline> = {}): RawAgileCrmPipeline {
  return { id: 1, name: 'Sales', ...overrides }
}

describe('agilecrm transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales')
  })

  it('maps milestones as stages', () => {
    const result = transformPipeline(makeRaw({ milestones: [{ id: 10, name: 'Qualified', probability: 50 }] }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].name).toBe('Qualified')
    expect(result.stages?.[0].win_probability).toBe(50)
  })

  it('defaults to empty stages', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
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
