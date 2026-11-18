import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawOnePageCrmStatus,
} from '../../../../../../../src/verticals/crm/adapters/onepagecrm/transform/pipeline'

function makeRaw(overrides: Partial<RawOnePageCrmStatus> = {}): RawOnePageCrmStatus {
  return { id: '1', ...overrides }
}

describe('onepagecrm transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: '5' })).id).toBe('5')
  })

  it('maps name from text', () => {
    expect(transformPipeline(makeRaw({ text: 'Active' })).name).toBe('Active')
  })

  it('falls back to status when text absent', () => {
    expect(transformPipeline(makeRaw({ status: 'pending' })).name).toBe('pending')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: '5' }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
