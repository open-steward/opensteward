import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawHubSpotPipeline,
} from '../../../../../../../src/verticals/crm/adapters/hubspot/transform/pipeline'

function makeRaw(overrides: Partial<RawHubSpotPipeline> = {}): RawHubSpotPipeline {
  return { id: 'hs-p-1', label: 'Sales', ...overrides }
}

describe('hubspot transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw({ id: 'hs-p-1' })).id).toBe('hs-p-1')
  })

  it('maps label to name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales')
  })

  it('maps stages', () => {
    const result = transformPipeline(makeRaw({
      stages: [{ id: 's-1', label: 'Appointment', displayOrder: 1 }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('s-1')
    expect(result.stages?.[0].name).toBe('Appointment')
    expect(result.stages?.[0].order).toBe(1)
  })

  it('defaults stages to empty array', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 'hs-p-1' }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
