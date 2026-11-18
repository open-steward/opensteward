import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawNocrmPipeline,
} from '../../../../../../../src/verticals/crm/adapters/nocrm-io/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawNocrmPipeline> = {}): RawNocrmPipeline {
  return {
    id: 1,
    name: 'Sales Pipeline',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    steps: [
      { id: 10, name: 'Prospecting', position: 1, pipeline_id: 1 },
      { id: 11, name: 'Negotiation', position: 2, pipeline_id: 1 },
    ],
    ...overrides,
  }
}

describe('nocrm-io transformPipeline', () => {
  it('maps id (number) to string id', () => {
    expect(transformPipeline(makeRaw({ id: 1 })).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales Pipeline')
  })

  it('uses empty string when name is null', () => {
    expect(transformPipeline(makeRaw({ name: null })).name).toBe('')
  })

  it('maps steps to stages', () => {
    const stages = transformPipeline(makeRaw()).stages
    expect(stages).toHaveLength(2)
    expect(stages?.[0].id).toBe('10')
    expect(stages?.[0].name).toBe('Prospecting')
    expect(stages?.[0].order).toBe(1)
    expect(stages?.[1].id).toBe('11')
    expect(stages?.[1].name).toBe('Negotiation')
  })

  it('omits stages when steps is null', () => {
    expect(transformPipeline(makeRaw({ steps: null })).stages).toBeUndefined()
  })

  it('maps created_at / updated_at', () => {
    const result = transformPipeline(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes PipelineSchema validation', () => {
    expect(() => PipelineSchema.parse(transformPipeline(makeRaw()))).not.toThrow()
  })

  it('passes PipelineSchema validation with no steps', () => {
    expect(() =>
      PipelineSchema.parse(transformPipeline(makeRaw({ steps: undefined }))),
    ).not.toThrow()
  })
})
