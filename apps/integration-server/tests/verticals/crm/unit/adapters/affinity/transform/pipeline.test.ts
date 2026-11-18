import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawAffinityList } from '../../../../../../../src/verticals/crm/adapters/affinity/transform/pipeline'

function makeRaw(overrides: Partial<RawAffinityList> = {}): RawAffinityList {
  return { id: 1, name: 'Sales Pipeline', ...overrides }
}

describe('affinity transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales Pipeline')
  })

  it('has empty stages', () => {
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
