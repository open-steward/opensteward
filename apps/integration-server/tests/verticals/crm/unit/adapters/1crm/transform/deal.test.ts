import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type Raw1CrmOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/1crm/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<Raw1CrmOpportunity> = {}): Raw1CrmOpportunity {
  return { id: 'opp-1', ...overrides }
}

describe('1crm transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 'opp-77' })).id).toBe('opp-77')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('converts major-unit amount to minor-unit integer', () => {
    // 50000.00 USD => 5_000_000 cents
    const result = transformDeal(makeRaw({ amount: 50000, currency_id: 'USD' }))
    expect(result.value?.amount).toBe(5000000)
    expect(result.value?.currency).toBe('USD')
  })

  it('handles string amount', () => {
    const result = transformDeal(makeRaw({ amount: '1234.56', currency_id: 'EUR' }))
    expect(result.value?.amount).toBe(123456)
  })

  it('maps Closed Won to status=won', () => {
    expect(transformDeal(makeRaw({ sales_stage: 'Closed Won' })).status).toBe('won')
  })

  it('maps Closed Lost to status=lost', () => {
    expect(transformDeal(makeRaw({ sales_stage: 'Closed Lost' })).status).toBe('lost')
  })

  it('maps any other sales_stage to status=open', () => {
    expect(transformDeal(makeRaw({ sales_stage: 'Prospecting' })).status).toBe('open')
    expect(transformDeal(makeRaw({ sales_stage: 'Negotiation/Review' })).status).toBe('open')
  })

  it('preserves sales_stage in stage field', () => {
    expect(transformDeal(makeRaw({ sales_stage: 'Qualification' })).stage).toBe('Qualification')
  })

  it('maps probability', () => {
    expect(transformDeal(makeRaw({ probability: 75 })).probability).toBe(75)
    expect(transformDeal(makeRaw({ probability: '40' })).probability).toBe(40)
  })

  it('maps account_id to company_id', () => {
    expect(transformDeal(makeRaw({ account_id: 'acc-3' })).company_id).toBe('acc-3')
  })

  it('maps assigned_user_id to owner_id', () => {
    expect(transformDeal(makeRaw({ assigned_user_id: 'u-8' })).owner_id).toBe('u-8')
  })

  it('converts close_date to ISO datetime', () => {
    const result = transformDeal(makeRaw({ close_date: '2026-03-31T00:00:00Z' }))
    expect(result.close_date).toMatch(/2026-03-31/)
  })

  it('passes DealSchema.parse without throwing', () => {
    const raw = makeRaw({
      name: 'Acme Q1 Expansion',
      amount: 50000,
      currency_id: 'USD',
      sales_stage: 'Negotiation/Review',
      probability: 60,
      close_date: '2026-03-31T00:00:00Z',
      account_id: 'acc-1',
      assigned_user_id: 'u-1',
      date_entered: '2026-01-01T00:00:00Z',
      date_modified: '2026-01-02T00:00:00Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('1crm untransformDeal', () => {
  it('maps title back to name', () => {
    expect(untransformDeal({ title: 'Big Deal' }).name).toBe('Big Deal')
  })

  it('converts minor-unit amount back to major units', () => {
    // 5_000_000 cents => 50000.00
    const result = untransformDeal({ value: { amount: 5000000, currency: 'USD' } })
    expect(result.amount).toBe(50000)
  })

  it('maps stage back to sales_stage', () => {
    expect(untransformDeal({ stage: 'Qualification' }).sales_stage).toBe('Qualification')
  })

  it('maps company_id back to account_id', () => {
    expect(untransformDeal({ company_id: 'acc-3' }).account_id).toBe('acc-3')
  })

  it('round-trips title and value', () => {
    const raw = makeRaw({
      name: 'Round-trip Deal',
      amount: 1000,
      currency_id: 'USD',
      sales_stage: 'Prospecting',
    })
    const canonical = transformDeal(raw)
    const back = untransformDeal(canonical)
    expect(back.name).toBe('Round-trip Deal')
    expect(back.amount).toBe(1000)
    expect(back.sales_stage).toBe('Prospecting')
  })
})
