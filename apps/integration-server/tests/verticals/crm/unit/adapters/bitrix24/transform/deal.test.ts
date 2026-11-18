import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawBitrix24Deal } from '../../../../../../../src/verticals/crm/adapters/bitrix24/transform/deal'

function makeRaw(overrides: Partial<RawBitrix24Deal> = {}): RawBitrix24Deal {
  return { ID: '1', TITLE: 'Big Deal', ...overrides }
}

describe('bitrix24 transformDeal', () => {
  it('maps ID to id string', () => {
    expect(transformDeal(makeRaw()).id).toBe('1')
  })

  it('maps title from TITLE', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value from OPPORTUNITY and CURRENCY_ID', () => {
    const result = transformDeal(makeRaw({ OPPORTUNITY: '1000', CURRENCY_ID: 'EUR' }))
    expect(result.value?.amount).toBe(1000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps TITLE back', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.TITLE).toBe('New Deal')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
