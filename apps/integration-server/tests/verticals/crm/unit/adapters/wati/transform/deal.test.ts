import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  type RawWatiDeal,
} from '../../../../../../../src/verticals/crm/adapters/wati/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

describe('wati transformDeal (stub)', () => {
  it('maps id to string', () => {
    const raw: RawWatiDeal = { id: 'deal_001', title: 'Big Deal' }
    expect(transformDeal(raw).id).toBe('deal_001')
  })

  it('converts numeric id to string', () => {
    const raw: RawWatiDeal = { id: 42 }
    expect(transformDeal(raw).id).toBe('42')
  })

  it('maps title', () => {
    const raw: RawWatiDeal = { id: 'deal_001', title: 'Big Deal' }
    expect(transformDeal(raw).title).toBe('Big Deal')
  })

  it('title defaults to empty string when absent', () => {
    const raw: RawWatiDeal = { id: 'deal_001' }
    expect(transformDeal(raw).title).toBe('')
  })

  it('preserves raw as metadata by reference', () => {
    const raw: RawWatiDeal = { id: 'deal_001', title: 'Big Deal' }
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawWatiDeal = { id: 'deal_001', title: 'Big Deal' }
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})
