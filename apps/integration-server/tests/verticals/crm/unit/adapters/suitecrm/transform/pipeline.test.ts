import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/pipeline'
import type { RawSuiteCrmPipeline } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/pipeline'

function makeRaw(overrides: Partial<RawSuiteCrmPipeline> = {}): RawSuiteCrmPipeline {
  return { id: 'p1', ...overrides }
}

describe('suitecrm transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('p1')
  })
  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Pipeline' })).name).toBe('Pipeline')
  })
  it('returns empty stages', () => {
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
    const result = transformPipeline(makeRaw())
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
