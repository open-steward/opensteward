import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawWebcrmOpportunity } from '../../../../../../../src/verticals/crm/adapters/webcrm/transform/deal'

function makeRaw(overrides: Partial<RawWebcrmOpportunity> = {}): RawWebcrmOpportunity {
  return { ...overrides }
}

describe('webcrm transformDeal', () => {
  it('maps id from OpportunityId', () => {
    expect(transformDeal(makeRaw({ OpportunityId: 1 })).id).toBe('1')
  })

  it('maps title from OpportunityHeading', () => {
    expect(transformDeal(makeRaw({ OpportunityHeading: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('maps value from OpportunityValue', () => {
    const result = transformDeal(makeRaw({ OpportunityValue: 500, OpportunityCurrency: 'GBP' }))
    expect(result.value?.amount).toBe(500)
    expect(result.value?.currency).toBe('GBP')
  })

  it('maps status from OpportunityStatus', () => {
    expect(transformDeal(makeRaw({ OpportunityStatus: 'open' })).status).toBe('open')
  })

  it('maps stage_id from PipelineStageId', () => {
    expect(transformDeal(makeRaw({ PipelineStageId: 10 })).stage_id).toBe('10')
  })

  it('maps company_id from OrganisationId', () => {
    expect(transformDeal(makeRaw({ OrganisationId: 3 })).company_id).toBe('3')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Test', status: 'open' })
    expect(result.OpportunityHeading).toBe('Test')
    expect(result.OpportunityStatus).toBe('open')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ OpportunityId: 1 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
