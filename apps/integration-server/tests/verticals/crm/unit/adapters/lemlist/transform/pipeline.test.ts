import { describe, it, expect } from 'vitest'
import {
  transformCampaignAsPipeline,
  type RawLemlistCampaign,
} from '../../../../../../../src/verticals/crm/adapters/lemlist/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawLemlistCampaign> = {}): RawLemlistCampaign {
  return { _id: 'camp_1', ...overrides }
}

describe('lemlist transformCampaignAsPipeline', () => {
  it('maps _id to string id', () => {
    expect(transformCampaignAsPipeline(makeRaw({ _id: 'camp_42' })).id).toBe('camp_42')
  })

  it('maps name', () => {
    expect(transformCampaignAsPipeline(makeRaw({ name: 'Q1 Outreach' })).name).toBe('Q1 Outreach')
  })

  it('defaults name to empty string when absent', () => {
    expect(transformCampaignAsPipeline(makeRaw()).name).toBe('')
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw({ name: 'Q1 Outreach' })
    expect(transformCampaignAsPipeline(raw).metadata).toBe(raw)
  })

  it('produces a PipelineSchema-valid result', () => {
    const raw = makeRaw({
      _id: 'camp_1',
      name: 'Q1 Outreach',
      labels: ['sales', 'cold'],
    })
    expect(() => PipelineSchema.parse(transformCampaignAsPipeline(raw))).not.toThrow()
  })
})
