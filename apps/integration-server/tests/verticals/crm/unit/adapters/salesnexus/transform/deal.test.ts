import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawSalesnexusDeal,
} from '../../../../../../../src/verticals/crm/adapters/salesnexus/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
// SALES_FIELDS constants (from ../constants.ts):
//   SALES_ID='218', CONTACT_ID='220', TITLE='221', STATUS='222',
//   AMOUNT='225', CLOSE_DATE='226', OWNER_ID='229', STAGE='234'

function makeRaw(fieldValues: Record<string, string> = {}): RawSalesnexusDeal {
  return { 'sales-id': 's-1', 'field-values': fieldValues }
}

describe('salesnexus transformDeal', () => {
  it('maps sales-id to id string', () => {
    expect(transformDeal(makeRaw()).id).toBe('s-1')
  })

  it('maps title from field 221', () => {
    expect(transformDeal(makeRaw({ '221': 'Enterprise Deal' })).title).toBe('Enterprise Deal')
  })

  it('falls back to empty string when title absent', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('maps status code 0 → open, 1 → won, 2 → lost', () => {
    expect(transformDeal(makeRaw({ '222': '0' })).status).toBe('open')
    expect(transformDeal(makeRaw({ '222': '1' })).status).toBe('won')
    expect(transformDeal(makeRaw({ '222': '2' })).status).toBe('lost')
  })

  it('converts major-unit amount (225) to minor-unit cents', () => {
    // 15000 major units → 1_500_000 cents
    const result = transformDeal(makeRaw({ '225': '15000' }))
    expect(result.value?.amount).toBe(1_500_000)
    expect(result.value?.currency).toBe('USD')
  })

  it('handles fractional major-unit amount', () => {
    // 99.99 → 9999 cents
    expect(transformDeal(makeRaw({ '225': '99.99' })).value?.amount).toBe(9999)
  })

  it('maps contact_id (220) to contact_ids array', () => {
    expect(transformDeal(makeRaw({ '220': 'c-5' })).contact_ids).toEqual(['c-5'])
  })

  it('maps owner_id from field 229', () => {
    expect(transformDeal(makeRaw({ '229': 'u-77' })).owner_id).toBe('u-77')
  })

  it('maps stage from field 234', () => {
    expect(transformDeal(makeRaw({ '234': 'Proposal' })).stage).toBe('Proposal')
  })

  it('coerces close_date (226) to ISO string', () => {
    const result = transformDeal(makeRaw({ '226': '2025-03-31T00:00:00Z' }))
    expect(result.close_date).toBe('2025-03-31T00:00:00.000Z')
  })

  it('produces schema-valid output', () => {
    const raw: RawSalesnexusDeal = {
      'sales-id': 's-99',
      'field-values': {
        '221': 'Big Deal',
        '222': '0',
        '225': '5000',
        '220': 'c-10',
        '226': '2025-12-31T00:00:00.000Z',
      },
    }
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('salesnexus untransformDeal', () => {
  it('maps title to field key 221', () => {
    expect(untransformDeal({ title: 'My Deal' })).toMatchObject({ '221': 'My Deal' })
  })

  it('converts minor-unit cents back to major-unit string for field 225', () => {
    // 1_500_000 cents → "15000"
    const result = untransformDeal({ value: { amount: 1_500_000, currency: 'USD' } })
    expect(result['225']).toBe('15000')
  })

  it('maps status open → code 0', () => {
    expect(untransformDeal({ status: 'open' })).toMatchObject({ '222': '0' })
  })

  it('maps status won → code 1', () => {
    expect(untransformDeal({ status: 'won' })).toMatchObject({ '222': '1' })
  })

  it('round-trips title through transform/untransform', () => {
    const raw = makeRaw({ '221': 'Round Trip' })
    const deal = transformDeal(raw)
    const back = untransformDeal(deal)
    expect(back['221']).toBe('Round Trip')
  })
})
