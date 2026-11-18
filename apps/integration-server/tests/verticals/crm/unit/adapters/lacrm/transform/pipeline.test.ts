import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawLacrmPipeline,
} from '../../../../../../../src/verticals/crm/adapters/lacrm/transform/pipeline'

function makeRaw(overrides: Partial<RawLacrmPipeline> = {}): RawLacrmPipeline {
  return { PipelineId: 'p-1', ...overrides }
}

describe('lacrm transformPipeline', () => {
  it('maps PipelineId to id', () => {
    expect(transformPipeline(makeRaw({ PipelineId: 'p-1' })).id).toBe('p-1')
  })

  it('maps Name to name', () => {
    expect(transformPipeline(makeRaw({ Name: 'Sales' })).name).toBe('Sales')
  })

  it('defaults name to empty string', () => {
    expect(transformPipeline(makeRaw()).name).toBe('')
  })

  it('maps Statuses to stages', () => {
    const result = transformPipeline(makeRaw({
      Statuses: [{ StatusId: 's-1', Name: 'New', SortOrder: 1 }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('s-1')
    expect(result.stages?.[0].name).toBe('New')
    expect(result.stages?.[0].order).toBe(1)
  })

  it('is marked active', () => {
    expect(transformPipeline(makeRaw()).is_active).toBe(true)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ PipelineId: 'p-1' }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
