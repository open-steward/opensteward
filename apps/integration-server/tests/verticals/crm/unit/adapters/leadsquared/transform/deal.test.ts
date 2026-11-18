import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal } from '../../../../../../../src/verticals/crm/adapters/leadsquared/transform/deal'

describe('leadsquared transformDeal', () => {
  it('maps activity to canonical Deal', () => {
    const raw = { ActivityId: 'act-1', EventName: 'Demo', ActivityNote: 'Shown product', LeadId: 'lead-99' }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('act-1')
    expect(deal.title).toBe('Demo')
    expect(deal.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { ActivityId: 'act-1', EventName: 'Demo', ActivityNote: 'Shown product', LeadId: 'lead-99' }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
