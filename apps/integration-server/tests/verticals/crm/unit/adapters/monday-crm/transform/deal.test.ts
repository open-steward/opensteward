import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/monday-crm/transform/deal'
import type { MondayItem } from '../../../../../../../src/verticals/crm/adapters/monday-crm/client'

function makeRaw(overrides: Partial<MondayItem> = {}): MondayItem {
  return { id: 'md-1', name: 'Deal', column_values: [], ...overrides }
}

describe('monday-crm transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw({ id: 'md-1' })).id).toBe('md-1')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('extracts amount from numbers column', () => {
    const result = transformDeal(makeRaw({
      column_values: [{ id: 'numbers', text: '5000', type: 'numbers', value: '5000' }],
    }))
    expect(result.value).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('sets value to undefined for non-numeric numbers column', () => {
    const result = transformDeal(makeRaw({
      column_values: [{ id: 'numbers', text: '', type: 'numbers', value: '' }],
    }))
    expect(result.value).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw as unknown as Record<string, unknown>)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 'md-1' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('monday-crm untransformDeal', () => {
  it('produces name and column_values string', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.name).toBe('New Deal')
    expect(typeof result.column_values).toBe('string')
  })
})
