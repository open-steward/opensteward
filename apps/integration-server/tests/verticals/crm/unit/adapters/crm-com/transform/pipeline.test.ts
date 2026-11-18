import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawCrmComPipeline } from '../../../../../../../src/verticals/crm/adapters/crm-com/transform/pipeline'

function makeRaw(overrides: Partial<RawCrmComPipeline> = {}): RawCrmComPipeline {
  return { id: '1', ...overrides }
}

describe('crm-com transformPipeline', () => {
  it('maps id', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name', () => {
    const result = transformPipeline(makeRaw({ name: 'Sales Pipeline' }))
    expect(result.name).toBe('Sales Pipeline')
  })

  it('maps is_active', () => {
    const result = transformPipeline(makeRaw({ is_active: false }))
    expect(result.is_active).toBe(false)
  })

  it('maps stages with win_probability', () => {
    const result = transformPipeline(makeRaw({
      stages: [{ id: 's1', name: 'Prospect', probability: 25 }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages![0].id).toBe('s1')
    expect(result.stages![0].win_probability).toBe(25)
  })

  it('produces empty stages when none provided', () => {
    const result = transformPipeline(makeRaw())
    expect(result.stages).toEqual([])
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
