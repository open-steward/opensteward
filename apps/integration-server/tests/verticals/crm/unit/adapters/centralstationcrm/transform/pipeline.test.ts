import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawCentralStationDealType,
  type RawCentralStationDealTypeStage,
} from '../../../../../../../src/verticals/crm/adapters/centralstationcrm/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawCentralStationDealType> = {}): RawCentralStationDealType {
  return { id: 1, name: 'Sales', ...overrides }
}

function makeStage(
  overrides: Partial<RawCentralStationDealTypeStage> = {},
): RawCentralStationDealTypeStage {
  return { id: 10, name: 'Prospecting', position: 0, ...overrides }
}

describe('centralstationcrm transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Enterprise Sales' })).name).toBe('Enterprise Sales')
  })

  it('defaults name to empty string when absent', () => {
    expect(transformPipeline({ id: 1 }).name).toBe('')
  })

  it('hardcodes is_active to true', () => {
    expect(transformPipeline(makeRaw()).is_active).toBe(true)
  })

  it('maps deal_type_stages to stages', () => {
    const result = transformPipeline(
      makeRaw({
        deal_type_stages: [
          { id: 10, name: 'Lead', position: 0 },
          { id: 20, name: 'Proposal', position: 1 },
        ],
      }),
    )
    expect(result.stages).toHaveLength(2)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].name).toBe('Lead')
    expect(result.stages?.[0].order).toBe(0)
    expect(result.stages?.[1].id).toBe('20')
    expect(result.stages?.[1].name).toBe('Proposal')
  })

  it('returns undefined stages when deal_type_stages is empty', () => {
    const result = transformPipeline(makeRaw({ deal_type_stages: [] }))
    expect(result.stages).toBeUndefined()
  })

  it('maps stage position to order', () => {
    const result = transformPipeline(makeRaw({ deal_type_stages: [makeStage({ position: 3 })] }))
    expect(result.stages?.[0].order).toBe(3)
  })

  it('maps created_at and updated_at', () => {
    const result = transformPipeline(
      makeRaw({
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('produces output that passes PipelineSchema.parse', () => {
    const raw = makeRaw({
      deal_type_stages: [
        { id: 1, name: 'Lead', position: 0 },
        { id: 2, name: 'Qualified', position: 1 },
        { id: 3, name: 'Won', position: 2, stage_type: 'won' },
      ],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
  })
})
