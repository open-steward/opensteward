import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawTribeCrmOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/tribe-crm/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawTribeCrmOpportunity> = {}): RawTribeCrmOpportunity {
  return { Id: 1, ...overrides }
}

describe('tribe-crm transformDeal', () => {
  it('maps Id to string id', () => {
    expect(transformDeal(makeRaw({ Id: 10 })).id).toBe('10')
  })

  it('maps Subject to title', () => {
    const result = transformDeal(makeRaw({ Subject: 'Big Contract' }))
    expect(result.title).toBe('Big Contract')
  })

  it('defaults title to empty string when Subject absent', () => {
    const result = transformDeal(makeRaw({ Subject: undefined }))
    expect(result.title).toBe('')
  })

  it('maps EstimatedAmount as-is (no minor-unit conversion) with default currency EUR', () => {
    // Tribe CRM does NOT multiply by 100 — EstimatedAmount is stored directly as value.amount
    const result = transformDeal(makeRaw({ EstimatedAmount: 5000 }))
    expect(result.value?.amount).toBe(5000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('uses explicit Currency when provided', () => {
    const result = transformDeal(makeRaw({ EstimatedAmount: 1000, Currency: 'GBP' }))
    expect(result.value?.currency).toBe('GBP')
  })

  it('maps Phase to stage', () => {
    const result = transformDeal(makeRaw({ Phase: 'Negotiation' }))
    expect(result.stage).toBe('Negotiation')
  })

  it('maps PhaseId to stage_id', () => {
    const result = transformDeal(makeRaw({ PhaseId: 3 }))
    expect(result.stage_id).toBe('3')
  })

  it('maps PipelineId to pipeline_id', () => {
    const result = transformDeal(makeRaw({ PipelineId: 1 }))
    expect(result.pipeline_id).toBe('1')
  })

  it('wraps RelationId into contact_ids array', () => {
    const result = transformDeal(makeRaw({ RelationId: 11 }))
    expect(result.contact_ids).toEqual(['11'])
  })

  it('maps OrganisationId to company_id', () => {
    const result = transformDeal(makeRaw({ OrganisationId: 7 }))
    expect(result.company_id).toBe('7')
  })

  it('maps OwnerId to owner_id', () => {
    const result = transformDeal(makeRaw({ OwnerId: 2 }))
    expect(result.owner_id).toBe('2')
  })

  it('maps Status to status', () => {
    const result = transformDeal(makeRaw({ Status: 'open' }))
    expect(result.status).toBe('open')
  })

  it('maps OpportunityPercent to probability', () => {
    const result = transformDeal(makeRaw({ OpportunityPercent: 75 }))
    expect(result.probability).toBe(75)
  })

  it('maps ExpectedOrderDate to close_date', () => {
    const result = transformDeal(makeRaw({ ExpectedOrderDate: '2026-03-31T00:00:00.000Z' }))
    expect(result.close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('maps CreatedOn to created_at', () => {
    const result = transformDeal(makeRaw({ CreatedOn: '2026-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation', () => {
    const raw = makeRaw({
      Id: 10,
      Subject: 'Big Contract',
      EstimatedAmount: 5000,
      Currency: 'EUR',
      Phase: 'Negotiation',
      PhaseId: 3,
      PipelineId: 1,
      RelationId: 11,
      OrganisationId: 7,
      OwnerId: 2,
      Status: 'open',
      OpportunityPercent: 60,
      ExpectedOrderDate: '2026-03-31T00:00:00.000Z',
      CreatedOn: '2026-01-15T09:30:00.000Z',
      ModifiedOn: '2026-02-01T14:20:00.000Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('tribe-crm untransformDeal', () => {
  it('maps title back to Subject', () => {
    const result = untransformDeal({ title: 'Big Contract' })
    expect(result.Subject).toBe('Big Contract')
  })

  it('maps value.amount back to EstimatedAmount as-is (no conversion)', () => {
    // untransformDeal writes value.amount directly — no /100 conversion
    const result = untransformDeal({ value: { amount: 5000, currency: 'EUR' } })
    expect(result.EstimatedAmount).toBe(5000)
  })

  it('maps stage_id back to PhaseId', () => {
    const result = untransformDeal({ stage_id: '3' })
    expect(result.PhaseId).toBe('3')
  })

  it('maps pipeline_id back to PipelineId', () => {
    const result = untransformDeal({ pipeline_id: '1' })
    expect(result.PipelineId).toBe('1')
  })

  it('maps close_date back to ExpectedOrderDate', () => {
    const result = untransformDeal({ close_date: '2026-03-31T00:00:00.000Z' })
    expect(result.ExpectedOrderDate).toBe('2026-03-31T00:00:00.000Z')
  })

  it('omits undefined fields', () => {
    const result = untransformDeal({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
