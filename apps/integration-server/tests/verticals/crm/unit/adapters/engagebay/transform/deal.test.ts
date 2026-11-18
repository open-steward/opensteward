import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawEngageBayDeal,
} from '../../../../../../../src/verticals/crm/adapters/engagebay/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawEngageBayDeal> = {}): RawEngageBayDeal {
  return { id: 1, ...overrides }
}

describe('engagebay transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 77 })).id).toBe('77')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('falls back to empty string when name absent', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('builds value object when amount and currency_type present', () => {
    const result = transformDeal(makeRaw({ amount: 5000, currency_type: 'USD' }))
    expect(result.value).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('omits value when currency_type absent', () => {
    const result = transformDeal(makeRaw({ amount: 5000 }))
    expect(result.value).toBeUndefined()
  })

  it('omits value when amount absent', () => {
    const result = transformDeal(makeRaw({ currency_type: 'USD' }))
    expect(result.value).toBeUndefined()
  })

  it('maps milestoneLabelName to stage', () => {
    expect(transformDeal(makeRaw({ milestoneLabelName: 'Proposal' })).stage).toBe('Proposal')
  })

  it('maps track_id to pipeline_id string', () => {
    expect(transformDeal(makeRaw({ track_id: 9 })).pipeline_id).toBe('9')
  })

  it('maps owner_id to string', () => {
    expect(transformDeal(makeRaw({ owner_id: 4 })).owner_id).toBe('4')
  })

  it('converts epoch ms closed_date to ISO datetime', () => {
    const result = transformDeal(makeRaw({ closed_date: 1700000000000 }))
    expect(result.close_date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation with full input', () => {
    const raw: RawEngageBayDeal = {
      id: 77,
      name: 'Big Deal',
      amount: 5000,
      currency_type: 'USD',
      closed_date: 1700000000000,
      track_id: 9,
      milestoneLabelName: 'Proposal',
      owner_id: 4,
      created_time: 1699000000000,
      updated_time: 1700000000000,
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('engagebay untransformDeal', () => {
  it('maps title back to name', () => {
    expect(untransformDeal({ title: 'Big Deal' }).name).toBe('Big Deal')
  })

  it('maps value amount and currency', () => {
    const result = untransformDeal({ value: { amount: 5000, currency: 'USD' } })
    expect(result.amount).toBe(5000)
    expect(result.currency_type).toBe('USD')
  })

  it('maps stage back to milestoneLabelName', () => {
    expect(untransformDeal({ stage: 'Proposal' }).milestoneLabelName).toBe('Proposal')
  })

  it('converts pipeline_id to number for track_id', () => {
    expect(untransformDeal({ pipeline_id: '9' }).track_id).toBe(9)
  })

  it('converts close_date ISO to epoch ms', () => {
    const result = untransformDeal({ close_date: '2023-11-14T22:13:20.000Z' })
    expect(typeof result.closed_date).toBe('number')
  })

  it('omits unset fields', () => {
    const result = untransformDeal({})
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('amount')
  })
})
