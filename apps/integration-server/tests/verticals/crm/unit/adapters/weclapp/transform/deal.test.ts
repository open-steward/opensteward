import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/weclapp/transform/deal'

describe('weclapp transformDeal', () => {
  it('maps raw salesOpportunity to canonical Deal', () => {
    const raw = {
      id: 'SO-001',
      name: 'Enterprise Project',
      forecastRevenue: 50000,
      salesStageId: 'stage-2',
      customerId: 'C-001',
      responsibleUserId: 'user-3',
    }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('SO-001')
    expect(deal.title).toBe('Enterprise Project')
    expect(deal.value?.amount).toBe(50000)
    expect(deal.stage_id).toBe('stage-2')
    expect(deal.contact_ids).toEqual(['C-001'])
    expect(deal.owner_id).toBe('user-3')
    expect(deal.metadata).toBe(raw)
  })

  it('untransforms Deal to weclapp payload', () => {
    const out = untransformDeal({ title: 'New Opportunity', stage_id: 'stage-1' })
    expect(out['name']).toBe('New Opportunity')
    expect(out['salesStageId']).toBe('stage-1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'SO-001',
      name: 'Enterprise Project',
      forecastRevenue: 50000,
      salesStageId: 'stage-2',
      customerId: 'C-001',
      responsibleUserId: 'user-3',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
