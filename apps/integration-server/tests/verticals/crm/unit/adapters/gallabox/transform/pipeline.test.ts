import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawGallaboxPipeline,
} from '../../../../../../../src/verticals/crm/adapters/gallabox/transform/pipeline'

function makeRaw(overrides: Partial<RawGallaboxPipeline> = {}): RawGallaboxPipeline {
  return { id: 'p-1', ...overrides }
}

describe('gallabox transformPipeline', () => {
  it('maps string id to string', () => {
    expect(transformPipeline(makeRaw({ id: 'p-99' })).id).toBe('p-99')
  })

  it('maps numeric id to string', () => {
    expect(transformPipeline(makeRaw({ id: 12 })).id).toBe('12')
  })

  it('maps name when present', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales Pipeline' })).name).toBe('Sales Pipeline')
  })

  it('falls back to empty string when name is absent', () => {
    expect(transformPipeline(makeRaw()).name).toBe('')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 'p-99' }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
