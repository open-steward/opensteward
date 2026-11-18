import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawNocrmDeal,
} from '../../../../../../../src/verticals/crm/adapters/nocrm-io/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

// nocrm-io deal.ts re-exports from lead.ts as transformDeal/untransformDeal
// RawNocrmDeal is an alias for RawNocrmLead

function makeRaw(overrides: Partial<RawNocrmDeal> = {}): RawNocrmDeal {
  return {
    id: 99,
    title: 'Acme Q1 Expansion',
    amount: 5000,
    currency: 'USD',
    status: 'open',
    probability: 60,
    step_id: 3,
    pipeline_id: 1,
    description: 'Big deal',
    estimated_closing_date: '2026-03-31T00:00:00.000Z',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    user: { id: 5 },
    contact_name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    phone: '+14155550123',
    tags: ['priority'],
    ...overrides,
  }
}

describe('nocrm-io transformDeal (via lead)', () => {
  it('maps id (number) to string id', () => {
    expect(transformDeal(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Acme Q1 Expansion')
  })

  it('maps amount directly as value.amount (not minor units)', () => {
    // noCRM stores amount as-is (not major→minor conversion)
    expect(transformDeal(makeRaw({ amount: 5000 })).value?.amount).toBe(5000)
  })

  it('maps currency to value.currency', () => {
    expect(transformDeal(makeRaw()).value?.currency).toBe('USD')
  })

  it('defaults currency to USD when absent', () => {
    expect(transformDeal(makeRaw({ currency: null })).value?.currency).toBe('USD')
  })

  it('maps status', () => {
    expect(transformDeal(makeRaw()).status).toBe('open')
  })

  it('maps step_id to stage_id string', () => {
    expect(transformDeal(makeRaw({ step_id: 3 })).stage_id).toBe('3')
  })

  it('maps pipeline_id to pipeline_id string', () => {
    expect(transformDeal(makeRaw({ pipeline_id: 1 })).pipeline_id).toBe('1')
  })

  it('maps user.id to owner_id string', () => {
    expect(transformDeal(makeRaw()).owner_id).toBe('5')
  })

  it('maps probability', () => {
    expect(transformDeal(makeRaw()).probability).toBe(60)
  })

  it('maps estimated_closing_date to close_date', () => {
    expect(transformDeal(makeRaw()).close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('omits value when amount is null', () => {
    expect(transformDeal(makeRaw({ amount: null })).value).toBeUndefined()
  })

  it('passes DealSchema validation', () => {
    expect(() => DealSchema.parse(transformDeal(makeRaw()))).not.toThrow()
  })

  it('untransformDeal maps title, amount, currency, status', () => {
    const out = untransformDeal({
      title: 'New Deal',
      value: { amount: 5000, currency: 'EUR' },
      status: 'won',
    })
    expect(out['title']).toBe('New Deal')
    expect(out['amount']).toBe(5000)
    expect(out['currency']).toBe('EUR')
    expect(out['status']).toBe('won')
  })
})
