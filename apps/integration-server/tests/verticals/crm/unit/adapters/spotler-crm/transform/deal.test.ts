import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/spotler-crm/transform/deal'

describe('spotler-crm transformDeal', () => {
  it('maps deal to canonical Deal', () => {
    const raw = { id: 99, opportunityname: 'New Website', value: 5000, stageid: 3, accountid: 10, contactid: 42 }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('99')
    expect(deal.title).toBe('New Website')
    expect(deal.value?.amount).toBe(5000)
    expect(deal.stage_id).toBe('3')
    expect(deal.company_id).toBe('10')
    expect(deal.contact_ids).toEqual(['42'])
    expect(deal.metadata).toBe(raw)
  })

  it('untransforms deal data', () => {
    const out = untransformDeal({ title: 'Test Deal', value: { amount: 2000, currency: 'GBP' } })
    expect(out.opportunityname).toBe('Test Deal')
    expect(out.value).toBe(2000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 99, opportunityname: 'New Website', value: 5000, stageid: 3, accountid: 10, contactid: 42 }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
