import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawKommoPipeline,
} from '../../../../../../../src/verticals/crm/adapters/kommo/transform/pipeline'

function makeRaw(overrides: Partial<RawKommoPipeline> = {}): RawKommoPipeline {
  return { id: 1, name: 'Sales', ...overrides }
}

describe('kommo transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 2 })).id).toBe('2')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales')
  })

  it('marks is_active when is_archive is false', () => {
    expect(transformPipeline(makeRaw({ is_archive: false })).is_active).toBe(true)
  })

  it('marks is_active false when is_archive is true', () => {
    expect(transformPipeline(makeRaw({ is_archive: true })).is_active).toBe(false)
  })

  it('maps statuses from _embedded to stages', () => {
    const result = transformPipeline(makeRaw({
      _embedded: { statuses: [{ id: 10, name: 'New', sort: 1 }] },
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].order).toBe(1)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 2 }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
