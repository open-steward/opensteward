import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/kintone/transform/deal'
import type { KintoneRecord } from '../../../../../../../src/verticals/crm/adapters/kintone/client'

function makeRaw(extra: Record<string, { value: unknown }> = {}): KintoneRecord {
  return {
    $id: { value: '5' },
    $revision: { value: '1' },
    ...extra,
  }
}

describe('kintone transformDeal', () => {
  it('maps $id to id', () => {
    expect(transformDeal(makeRaw()).id).toBe('5')
  })

  it('maps deal_name field to title', () => {
    const result = transformDeal(makeRaw({ deal_name: { value: 'My Deal' } }))
    expect(result.title).toBe('My Deal')
  })

  it('parses amount field to value', () => {
    const result = transformDeal(makeRaw({ amount: { value: '1500' }, currency: { value: 'JPY' } }))
    expect(result.value).toEqual({ amount: 1500, currency: 'JPY' })
  })

  it('splits comma-separated contact_ids', () => {
    const result = transformDeal(makeRaw({ contact_ids: { value: 'c1, c2, c3' } }))
    expect(result.contact_ids).toEqual(['c1', 'c2', 'c3'])
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

describe('kintone untransformDeal', () => {
  it('wraps title under deal_name key', () => {
    const result = untransformDeal({ title: 'Test Deal' })
    expect(result['deal_name']).toEqual({ value: 'Test Deal' })
  })
})
