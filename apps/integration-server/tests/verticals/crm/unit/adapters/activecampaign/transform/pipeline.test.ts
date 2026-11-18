import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawActiveCampaignPipeline,
  type RawActiveCampaignStage,
} from '../../../../../../../src/verticals/crm/adapters/activecampaign/transform/pipeline'

function makeRaw(overrides: Partial<RawActiveCampaignPipeline> = {}): RawActiveCampaignPipeline {
  return { id: '1', title: 'Sales', ...overrides }
}

describe('activecampaign transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('1')
  })

  it('maps name from title', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales')
  })

  it('maps stages array', () => {
    const stages: RawActiveCampaignStage[] = [{ id: '10', title: 'Lead', order: '1' }]
    const result = transformPipeline(makeRaw(), stages)
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].name).toBe('Lead')
  })

  it('defaults to empty stages', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
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
