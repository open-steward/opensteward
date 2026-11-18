import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawOutreachPipeline,
} from '../../../../../../../src/verticals/crm/adapters/outreach/transform/pipeline'

function makeRaw(overrides: Partial<RawOutreachPipeline> = {}): RawOutreachPipeline {
  return {
    id: '1',
    type: 'stage',
    attributes: {},
    ...overrides,
  }
}

describe('outreach transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: '9' })).id).toBe('9')
  })

  it('maps name from attributes.name', () => {
    expect(transformPipeline(makeRaw({ attributes: { name: 'Pipeline A' } })).name).toBe('Pipeline A')
  })

  it('returns empty stages array (placeholder)', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: '9' }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
