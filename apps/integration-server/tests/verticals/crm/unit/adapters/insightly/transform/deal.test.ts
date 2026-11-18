import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawInsightlyDeal,
} from '../../../../../../../src/verticals/crm/adapters/insightly/transform/deal'

function makeRaw(overrides: Partial<RawInsightlyDeal> = {}): RawInsightlyDeal {
  return { OPPORTUNITY_ID: 1, OPPORTUNITY_NAME: 'Big Opp', ...overrides }
}

describe('insightly transformDeal', () => {
  it('maps OPPORTUNITY_ID to string id', () => {
    expect(transformDeal(makeRaw({ OPPORTUNITY_ID: 7 })).id).toBe('7')
  })

  it('maps OPPORTUNITY_NAME to title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Opp')
  })

  it('maps BID_AMOUNT and BID_CURRENCY to value', () => {
    const result = transformDeal(makeRaw({ BID_AMOUNT: 5000, BID_CURRENCY: 'GBP' }))
    expect(result.value).toEqual({ amount: 5000, currency: 'GBP' })
  })

  it('maps OPPORTUNITY_STATE to status', () => {
    expect(transformDeal(makeRaw({ OPPORTUNITY_STATE: 'WON' })).status).toBe('WON')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ OPPORTUNITY_ID: 7 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('insightly untransformDeal', () => {
  it('maps title to OPPORTUNITY_NAME', () => {
    const result = untransformDeal({ title: 'New Opp' })
    expect(result.OPPORTUNITY_NAME).toBe('New Opp')
  })
})
