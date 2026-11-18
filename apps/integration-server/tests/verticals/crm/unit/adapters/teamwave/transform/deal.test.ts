import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawTeamwaveDeal } from '../../../../../../../src/verticals/crm/adapters/teamwave/transform/deal'

function makeRaw(overrides: Partial<RawTeamwaveDeal> = {}): RawTeamwaveDeal {
  return { id: 3, name: 'TW Deal', ...overrides }
}

describe('teamwave transformDeal', () => {
  it('maps id and title', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('3')
    expect(result.title).toBe('TW Deal')
  })

  it('maps value with currency', () => {
    const result = transformDeal(makeRaw({ value: 3000, currency: 'GBP' }))
    expect(result.value?.amount).toBe(3000)
    expect(result.value?.currency).toBe('GBP')
  })

  it('maps expected_close_date to close_date', () => {
    expect(transformDeal(makeRaw({ expected_close_date: '2024-12-31' })).close_date).toBe('2024-12-31')
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

describe('teamwave untransformDeal', () => {
  it('maps close_date to expected_close_date', () => {
    expect(untransformDeal({ close_date: '2025-01-01' }).expected_close_date).toBe('2025-01-01')
  })
})
