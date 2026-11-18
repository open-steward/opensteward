import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawCentralStationDeal,
} from '../../../../../../../src/verticals/crm/adapters/centralstationcrm/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawCentralStationDeal> = {}): RawCentralStationDeal {
  return { id: 1, name: 'Acme Deal', ...overrides }
}

describe('centralstationcrm transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big Contract' })).title).toBe('Big Contract')
  })

  it('defaults title to empty string when name absent', () => {
    expect(transformDeal({ id: 1 }).title).toBe('')
  })

  it('converts value from major units to minor units (cents)', () => {
    const result = transformDeal(makeRaw({ value: 15000, currency: 'EUR' }))
    expect(result.value?.amount).toBe(1500000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('handles string value', () => {
    const result = transformDeal(makeRaw({ value: '500', currency: 'USD' }))
    expect(result.value?.amount).toBe(50000)
    expect(result.value?.currency).toBe('USD')
  })

  it('defaults currency to EUR when absent', () => {
    const result = transformDeal(makeRaw({ value: 100 }))
    expect(result.value?.currency).toBe('EUR')
  })

  it('uppercases currency', () => {
    const result = transformDeal(makeRaw({ value: 100, currency: 'gbp' }))
    expect(result.value?.currency).toBe('GBP')
  })

  it('returns undefined value when value field is absent', () => {
    const result = transformDeal(makeRaw({ value: undefined }))
    expect(result.value).toBeUndefined()
  })

  it('maps status', () => {
    expect(transformDeal(makeRaw({ status: 'won' })).status).toBe('won')
  })

  it('maps user_id to owner_id as string', () => {
    expect(transformDeal(makeRaw({ user_id: 7 })).owner_id).toBe('7')
  })

  it('maps first company in companies array to company_id', () => {
    const result = transformDeal(
      makeRaw({
        companies: [{ company: { id: 10, name: 'Acme' } }],
      }),
    )
    expect(result.company_id).toBe('10')
  })

  it('maps created_at and updated_at', () => {
    const result = transformDeal(
      makeRaw({
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('produces output that passes DealSchema.parse', () => {
    const raw = makeRaw({
      value: 25000,
      currency: 'USD',
      status: 'open',
      user_id: 5,
      companies: [{ company: { id: 3, name: 'Acme' } }],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('centralstationcrm untransformDeal', () => {
  it('wraps output in deal key', () => {
    const result = untransformDeal({})
    expect(result).toHaveProperty('deal')
  })

  it('maps title to deal.name', () => {
    const result = untransformDeal({ title: 'Big Deal' })
    expect((result.deal as Record<string, unknown>).name).toBe('Big Deal')
  })

  it('maps status to deal.status', () => {
    const result = untransformDeal({ status: 'won' })
    expect((result.deal as Record<string, unknown>).status).toBe('won')
  })

  it('maps owner_id to deal.user_id', () => {
    const result = untransformDeal({ owner_id: 'usr_4' })
    expect((result.deal as Record<string, unknown>).user_id).toBe('usr_4')
  })

  it('converts value minor units to major units', () => {
    const result = untransformDeal({ value: { amount: 1500000, currency: 'EUR' } })
    const deal = result.deal as Record<string, unknown>
    expect(deal.value).toBe(15000)
    expect(deal.currency).toBe('EUR')
  })
})
