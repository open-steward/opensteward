import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawDeskeraPipeline } from '../../../../../../../src/verticals/crm/adapters/deskera/transform/pipeline'

function makeRaw(overrides: Partial<RawDeskeraPipeline> = {}): RawDeskeraPipeline {
  return { id: '1', ...overrides }
}

describe('deskera transformPipeline', () => {
  it('maps id', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name', () => {
    const result = transformPipeline(makeRaw({ name: 'Sales Pipeline' }))
    expect(result.name).toBe('Sales Pipeline')
  })

  it('maps stages with order index', () => {
    const result = transformPipeline(makeRaw({
      stages: [{ id: 's1', name: 'Prospect' }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages![0].id).toBe('s1')
    expect(result.stages![0].order).toBe(0)
  })

  it('produces undefined stages when none provided', () => {
    const result = transformPipeline(makeRaw())
    expect(result.stages).toBeUndefined()
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
