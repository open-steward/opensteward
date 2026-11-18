import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/podio/transform/deal'
import type { PodioItem } from '../../../../../../../src/verticals/crm/adapters/podio/client'

function makeRaw(overrides: Partial<PodioItem> = {}): PodioItem {
  return { item_id: 1, fields: [], ...overrides }
}

describe('podio transformDeal', () => {
  it('maps item_id to id string', () => {
    expect(transformDeal(makeRaw({ item_id: 3 })).id).toBe('3')
  })

  it('falls back to Deal {id} title when no title field', () => {
    expect(transformDeal(makeRaw({ item_id: 3 })).title).toBe('Deal 3')
  })

  it('parses value from value field', () => {
    const result = transformDeal(makeRaw({
      fields: [{ external_id: 'value', values: [{ value: '1500' }] }],
    }))
    expect(result.value?.amount).toBe(1500)
  })

  it('handles empty fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ item_id: 3 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('podio untransformDeal', () => {
  it('returns a fields envelope', () => {
    const result = untransformDeal({ title: 'Deal' })
    expect(result).toHaveProperty('fields')
  })
})
