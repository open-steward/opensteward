import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/ragic/transform/deal'
import type { RagicRecord } from '../../../../../../../src/verticals/crm/adapters/ragic/client'

function makeRaw(overrides: Partial<RagicRecord> = {}): RagicRecord {
  return { _ragic_id: 1, ...overrides }
}

describe('ragic transformDeal', () => {
  it('maps _ragic_id to id string', () => {
    expect(transformDeal(makeRaw({ _ragic_id: 5 })).id).toBe('5')
  })

  it('maps Deal Name to title', () => {
    expect(transformDeal(makeRaw({ 'Deal Name': 'Major Account' })).title).toBe('Major Account')
  })

  it('parses Amount to value', () => {
    const result = transformDeal(makeRaw({ 'Amount': '5000' }))
    expect(result.value?.amount).toBe(5000)
  })

  it('splits Contact IDs on comma', () => {
    const result = transformDeal(makeRaw({ 'Contact IDs': 'c1, c2, c3' }))
    expect(result.contact_ids).toEqual(['c1', 'c2', 'c3'])
  })

  it('handles empty record gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ _ragic_id: 5 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('ragic untransformDeal', () => {
  it('maps title to "Deal Name" field key', () => {
    const result = untransformDeal({ title: 'Big Deal' })
    expect(result['Deal Name']).toBe('Big Deal')
  })
})
