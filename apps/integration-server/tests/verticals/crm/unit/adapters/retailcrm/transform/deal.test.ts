import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/retailcrm/transform/deal'

describe('retailcrm transformDeal', () => {
  it('maps raw order to canonical Deal', () => {
    const raw = {
      id: 200,
      number: 'ORD-001',
      summ: 15000,
      status: 'new',
      customerId: 101,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-16T10:00:00Z',
    }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('200')
    expect(deal.title).toBe('Order #ORD-001')
    expect(deal.value?.amount).toBe(15000)
    expect(deal.status).toBe('new')
    expect(deal.contact_ids).toEqual(['101'])
    expect(deal.metadata).toBe(raw)
  })

  it('untransforms Deal to retailcrm payload', () => {
    const out = untransformDeal({ status: 'closed' })
    expect(out['status']).toBe('closed')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 200,
      number: 'ORD-001',
      summ: 15000,
      status: 'new',
      customerId: 101,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-16T10:00:00Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
