import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/agendor/transform/deal'

describe('agendor transformDeal', () => {
  it('maps raw deal to canonical Deal', () => {
    const raw = {
      id: 99,
      title: 'Big Sale',
      value: 5000,
      status: 'ongoing',
      funnel_stage: { id: 2 },
      funnel: { id: 1 },
      person: { id: 42 },
      organization: { id: 10 },
      owner: { id: 5 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('99')
    expect(deal.title).toBe('Big Sale')
    expect(deal.value?.amount).toBe(5000)
    expect(deal.stage_id).toBe('2')
    expect(deal.pipeline_id).toBe('1')
    expect(deal.contact_ids).toEqual(['42'])
    expect(deal.company_id).toBe('10')
    expect(deal.owner_id).toBe('5')
    expect(deal.metadata).toBe(raw)
  })

  it('untransforms Deal to agendor payload', () => {
    const out = untransformDeal({ title: 'New Deal', pipeline_id: '1', stage_id: '2' })
    expect(out['title']).toBe('New Deal')
    expect(out['funnel_id']).toBe(1)
    expect(out['funnel_stage_id']).toBe(2)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 99,
      title: 'Big Sale',
      value: 5000,
      status: 'ongoing',
      funnel_stage: { id: 2 },
      funnel: { id: 1 },
      person: { id: 42 },
      organization: { id: 10 },
      owner: { id: 5 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
