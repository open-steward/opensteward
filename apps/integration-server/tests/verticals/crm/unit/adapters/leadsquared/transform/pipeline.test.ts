import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawLeadsquaredPipeline } from '../../../../../../../src/verticals/crm/adapters/leadsquared/transform/pipeline'

function makeRaw(overrides: Partial<RawLeadsquaredPipeline> = {}): RawLeadsquaredPipeline {
  return { id: '1', ...overrides }
}

describe('leadsquared transformPipeline', () => {
  it('maps id', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name', () => {
    const result = transformPipeline(makeRaw({ name: 'Sales Pipeline' }))
    expect(result.name).toBe('Sales Pipeline')
  })

  it('defaults name to empty string', () => {
    const result = transformPipeline(makeRaw())
    expect(result.name).toBe('')
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
