import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawMethodOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/method-crm/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawMethodOpportunity> = {}): RawMethodOpportunity {
  return {
    RecordId: '20',
    OpportunityName: 'Acme Q1 Expansion',
    Amount: 1250.0,
    CloseDate: '2026-03-31T00:00:00.000Z',
    Description: 'Big deal',
    OpportunityStage: 'Negotiation',
    OpportunityType: 'New Business',
    ContactRecordID: '7',
    AssignedTo: 'usr_alice',
    CreatedDate: '2026-01-15T09:30:00.000Z',
    ModifiedDate: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('method-crm transformDeal', () => {
  it('maps RecordId to string id', () => {
    expect(transformDeal(makeRaw({ RecordId: 20 })).id).toBe('20')
  })

  it('maps OpportunityName to title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Acme Q1 Expansion')
  })

  it('converts Amount major units to minor units (cents)', () => {
    // 1250.00 USD → 125000 cents
    expect(transformDeal(makeRaw({ Amount: 1250.0 })).value?.amount).toBe(125000)
  })

  it('sets currency to USD', () => {
    expect(transformDeal(makeRaw()).value?.currency).toBe('USD')
  })

  it('maps OpportunityStage to stage', () => {
    expect(transformDeal(makeRaw()).stage).toBe('Negotiation')
  })

  it('maps ContactRecordID to contact_ids array', () => {
    expect(transformDeal(makeRaw()).contact_ids).toEqual(['7'])
  })

  it('maps CloseDate to close_date', () => {
    expect(transformDeal(makeRaw()).close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('maps CreatedDate / ModifiedDate', () => {
    const result = transformDeal(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('omits value when Amount is absent', () => {
    expect(transformDeal(makeRaw({ Amount: undefined })).value).toBeUndefined()
  })

  it('returns empty title for missing OpportunityName', () => {
    expect(transformDeal(makeRaw({ OpportunityName: undefined })).title).toBe('')
  })

  it('passes DealSchema validation', () => {
    expect(() => DealSchema.parse(transformDeal(makeRaw()))).not.toThrow()
  })

  it('untransformDeal converts minor units back to major', () => {
    // 125000 cents → 1250.00
    const out = untransformDeal({ title: 'Test', value: { amount: 125000, currency: 'USD' } })
    expect(out.Amount).toBeCloseTo(1250.0)
  })

  it('untransformDeal maps stage and title', () => {
    const out = untransformDeal({ title: 'New', stage: 'Proposal' })
    expect(out.OpportunityName).toBe('New')
    expect(out.OpportunityStage).toBe('Proposal')
  })
})
