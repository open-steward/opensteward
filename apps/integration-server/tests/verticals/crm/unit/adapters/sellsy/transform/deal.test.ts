import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/deal'

describe('sellsy transformDeal', () => {
  it('maps deal to canonical Deal', () => {
    const raw = { id: '2001', name: 'Big Contract', amount: 50000, step_id: '301', pipeline_id: '401', linked_contacts_ids: ['1001'], linked_company_id: '500' }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('2001')
    expect(deal.title).toBe('Big Contract')
    expect(deal.value?.amount).toBe(50000)
    expect(deal.stage_id).toBe('301')
    expect(deal.pipeline_id).toBe('401')
    expect(deal.contact_ids).toEqual(['1001'])
    expect(deal.company_id).toBe('500')
    expect(deal.metadata).toBe(raw)
  })

  it('untransforms deal data', () => {
    const out = untransformDeal({ title: 'New Deal', value: { amount: 1000, currency: 'EUR' } })
    expect(out.name).toBe('New Deal')
    expect(out.amount).toBe(1000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: '2001', name: 'Big Contract', amount: 50000, step_id: '301', pipeline_id: '401', linked_contacts_ids: ['1001'], linked_company_id: '500' }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
