import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawAcceloProspectType,
  type RawAcceloProspectStatus,
} from '../../../../../../../src/verticals/crm/adapters/accelo/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRawType(overrides: Partial<RawAcceloProspectType> = {}): RawAcceloProspectType {
  return { id: 'type-1', type: 'prospect_type', attributes: {}, ...overrides }
}

function makeStatus(overrides: Partial<RawAcceloProspectStatus> = {}): RawAcceloProspectStatus {
  return { id: 'st-1', ...overrides }
}

describe('accelo transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRawType({ id: 42 })).id).toBe('42')
  })

  it('maps title to name', () => {
    expect(transformPipeline(makeRawType({ title: 'New Business' })).name).toBe('New Business')
  })

  it('falls back to id string when title absent', () => {
    expect(transformPipeline(makeRawType({ id: '5' })).name).toBe('5')
  })

  it('is_active=true when standing="active"', () => {
    expect(transformPipeline(makeRawType({ standing: 'active' })).is_active).toBe(true)
  })

  it('is_active=false when standing="inactive"', () => {
    expect(transformPipeline(makeRawType({ standing: 'inactive' })).is_active).toBe(false)
  })

  it('is_active=undefined when standing absent', () => {
    expect(transformPipeline(makeRawType()).is_active).toBeUndefined()
  })

  it('returns undefined stages when no statuses provided', () => {
    expect(transformPipeline(makeRawType()).stages).toBeUndefined()
  })

  it('filters out inactive statuses', () => {
    const statuses: RawAcceloProspectStatus[] = [
      makeStatus({ id: 'st-1', title: 'Active Stage', ordering: '1' }),
      makeStatus({ id: 'st-2', title: 'Dead Stage', ordering: '2', standing: 'inactive' }),
    ]
    const pipeline = transformPipeline(makeRawType(), statuses)
    expect(pipeline.stages?.length).toBe(1)
    expect(pipeline.stages?.[0].id).toBe('st-1')
  })

  it('sorts stages by ordering ascending', () => {
    const statuses: RawAcceloProspectStatus[] = [
      makeStatus({ id: 'st-b', title: 'Second', ordering: '2' }),
      makeStatus({ id: 'st-a', title: 'First', ordering: '1' }),
    ]
    const pipeline = transformPipeline(makeRawType(), statuses)
    expect(pipeline.stages?.[0].id).toBe('st-a')
    expect(pipeline.stages?.[1].id).toBe('st-b')
  })

  it('maps stage ordering to order field', () => {
    const statuses: RawAcceloProspectStatus[] = [
      makeStatus({ id: 'st-1', title: 'First', ordering: '3' }),
    ]
    const pipeline = transformPipeline(makeRawType(), statuses)
    expect(pipeline.stages?.[0].order).toBe(3)
  })

  it('passes PipelineSchema.parse without throwing', () => {
    const statuses: RawAcceloProspectStatus[] = [
      makeStatus({ id: 'st-1', title: 'Qualifying', ordering: '1' }),
      makeStatus({ id: 'st-2', title: 'Proposal', ordering: '2' }),
    ]
    const raw = makeRawType({ id: '10', title: 'New Business', standing: 'active' })
    expect(() => PipelineSchema.parse(transformPipeline(raw, statuses))).not.toThrow()
  })
})
