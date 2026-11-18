import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawTotangoPipeline,
} from '../../../../../../../src/verticals/crm/adapters/totango/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawTotangoPipeline> = {}): RawTotangoPipeline {
  return { id: 'pl-1', name: 'Lifecycle', ...overrides }
}

describe('totango transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Lifecycle' })).name).toBe('Lifecycle')
  })

  it('defaults name to empty string when absent', () => {
    const result = transformPipeline(makeRaw({ name: undefined }))
    expect(result.name).toBe('')
  })

  it('defaults id to empty string when absent', () => {
    const result = transformPipeline(makeRaw({ id: undefined }))
    expect(result.id).toBe('')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('passes PipelineSchema validation', () => {
    const raw = makeRaw({ id: 'pl-1', name: 'Lifecycle' })
    expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
  })
})
