import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawClosePipeline } from '../../../../../../../src/verticals/crm/adapters/close/transform/pipeline'

function makeRaw(overrides: Partial<RawClosePipeline> = {}): RawClosePipeline {
  return { id: 'p1', name: 'Sales Pipeline', ...overrides }
}

describe('close transformPipeline', () => {
  it('maps id and name', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('p1')
    expect(result.name).toBe('Sales Pipeline')
  })

  it('maps stages from stages array', () => {
    const result = transformPipeline(makeRaw({ stages: [{ id: 's1', label: 'Qualify', win_probability: 20 }] }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].name).toBe('Qualify')
    expect(result.stages?.[0].win_probability).toBe(20)
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
