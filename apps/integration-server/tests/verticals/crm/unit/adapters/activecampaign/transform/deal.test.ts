import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawActiveCampaignDeal } from '../../../../../../../src/verticals/crm/adapters/activecampaign/transform/deal'

function makeRaw(overrides: Partial<RawActiveCampaignDeal> = {}): RawActiveCampaignDeal {
  return { id: '1', title: 'Big Deal', ...overrides }
}

describe('activecampaign transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('converts value from cents', () => {
    const result = transformDeal(makeRaw({ value: '5000', currency: 'EUR' }))
    expect(result.value?.amount).toBe(50)
    expect(result.value?.currency).toBe('EUR')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal converts amount back to cents', () => {
    const result = untransformDeal({ title: 'T', value: { amount: 10, currency: 'USD' } })
    expect(result.value).toBe(1000)
    expect(result.currency).toBe('USD')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 7 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
