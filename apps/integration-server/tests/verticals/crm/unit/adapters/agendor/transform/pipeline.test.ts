import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawAgendorPipeline } from '../../../../../../../src/verticals/crm/adapters/agendor/transform/pipeline'

function makeRaw(overrides: Partial<RawAgendorPipeline> = {}): RawAgendorPipeline {
  return { id: 1, ...overrides }
}

describe('agendor transformPipeline', () => {
  it('maps id', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name', () => {
    const result = transformPipeline(makeRaw({ name: 'Main Funnel' }))
    expect(result.name).toBe('Main Funnel')
  })

  it('maps stages from funnel_stages', () => {
    const result = transformPipeline(makeRaw({
      funnel_stages: [{ id: 1, name: 'Prospect', sequence: 1 }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages![0].id).toBe('1')
    expect(result.stages![0].name).toBe('Prospect')
  })

  it('produces undefined stages when funnel_stages is missing', () => {
    const result = transformPipeline(makeRaw())
    expect(result.stages).toBeUndefined()
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
