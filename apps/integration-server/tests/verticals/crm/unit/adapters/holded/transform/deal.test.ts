import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/holded/transform/deal'

describe('holded transformDeal', () => {
  it('maps raw lead to canonical Deal', () => {
    const raw = {
      id: 'deal-1',
      name: 'Big Contract',
      amount: 10000,
      status: 'open',
      stageId: 'stage-2',
      funnelId: 'funnel-1',
      contactId: 'contact-5',
      created: 1704067200,
      updated: 1717200000,
    }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('deal-1')
    expect(deal.title).toBe('Big Contract')
    expect(deal.value?.amount).toBe(10000)
    expect(deal.stage_id).toBe('stage-2')
    expect(deal.pipeline_id).toBe('funnel-1')
    expect(deal.contact_ids).toEqual(['contact-5'])
    expect(deal.metadata).toBe(raw)
  })

  it('untransforms Deal to holded payload', () => {
    const out = untransformDeal({ title: 'New Lead', stage_id: 'stage-1' })
    expect(out['name']).toBe('New Lead')
    expect(out['stageId']).toBe('stage-1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'deal-1',
      name: 'Big Contract',
      amount: 10000,
      status: 'open',
      stageId: 'stage-2',
      funnelId: 'funnel-1',
      contactId: 'contact-5',
      created: 1704067200,
      updated: 1717200000,
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
