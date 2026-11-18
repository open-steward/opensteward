import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/teamleader/transform/deal'

describe('teamleader transformDeal', () => {
  it('maps deal to canonical Deal', () => {
    const raw = { id: 'dl-001', title: 'Big Deal', value: { amount: 15000, currency: 'EUR' }, phase: { id: 'ph-001' }, lead: { customer: { type: 'contact', id: 'tl-001' } } }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('dl-001')
    expect(deal.title).toBe('Big Deal')
    expect(deal.value?.amount).toBe(15000)
    expect(deal.stage_id).toBe('ph-001')
    expect(deal.contact_ids).toEqual(['tl-001'])
    expect(deal.metadata).toBe(raw)
  })

  it('sets company_id when lead type is company', () => {
    const raw = { id: 'dl-002', title: 'Corp Deal', lead: { customer: { type: 'company', id: 'co-001' } } }
    const deal = transformDeal(raw)
    expect(deal.company_id).toBe('co-001')
    expect(deal.contact_ids).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'dl-001', title: 'Big Deal', value: { amount: 15000, currency: 'EUR' }, phase: { id: 'ph-001' }, lead: { customer: { type: 'contact', id: 'tl-001' } } }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
