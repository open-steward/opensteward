import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawZendeskSellDeal } from '../../../../../../../src/verticals/crm/adapters/zendesk-sell/transform/deal'

function makeRaw(overrides: Partial<RawZendeskSellDeal> = {}): RawZendeskSellDeal {
  return { id: 3, name: 'ZD Deal', ...overrides }
}

describe('zendesk-sell transformDeal', () => {
  it('maps id and name to title', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('3')
    expect(result.title).toBe('ZD Deal')
  })

  it('maps value with currency', () => {
    const result = transformDeal(makeRaw({ value: 4500, currency: 'GBP' }))
    expect(result.value?.amount).toBe(4500)
    expect(result.value?.currency).toBe('GBP')
  })

  it('maps confidence to probability', () => {
    expect(transformDeal(makeRaw({ confidence: 75 })).probability).toBe(75)
  })

  it('maps estimated_close_date to close_date', () => {
    expect(transformDeal(makeRaw({ estimated_close_date: '2025-03-31' })).close_date).toBe('2025-03-31')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('zendesk-sell untransformDeal', () => {
  it('maps probability to confidence', () => {
    expect(untransformDeal({ probability: 50 }).confidence).toBe(50)
  })

  it('maps close_date to estimated_close_date', () => {
    expect(untransformDeal({ close_date: '2025-01-01' }).estimated_close_date).toBe('2025-01-01')
  })
})
