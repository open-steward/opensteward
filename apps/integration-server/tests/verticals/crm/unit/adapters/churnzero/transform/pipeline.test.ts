import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawChurnZeroPipeline,
} from '../../../../../../../src/verticals/crm/adapters/churnzero/transform/pipeline'

function makeRaw(overrides: Partial<RawChurnZeroPipeline> = {}): RawChurnZeroPipeline {
  return { id: 'P1', ...overrides }
}

describe('churnzero transformPipeline', () => {
  it('maps numeric id to string', () => {
    expect(transformPipeline(makeRaw({ id: 3 })).id).toBe('3')
  })

  it('maps string id to string', () => {
    expect(transformPipeline(makeRaw({ id: 'PIPE-1' })).id).toBe('PIPE-1')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales Pipeline' })).name).toBe('Sales Pipeline')
  })

  it('defaults name to empty string when absent', () => {
    expect(transformPipeline(makeRaw()).name).toBe('')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 3 }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
