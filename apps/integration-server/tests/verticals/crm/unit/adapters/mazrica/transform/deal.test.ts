import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawMazricaDeal,
} from '../../../../../../../src/verticals/crm/adapters/mazrica/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawMazricaDeal> = {}): RawMazricaDeal {
  return { id: 1, ...overrides }
}

describe('mazrica transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Enterprise deal' })).title).toBe('Enterprise deal')
  })

  it('maps numeric amount to value with JPY currency', () => {
    const result = transformDeal(makeRaw({ amount: 500000 }))
    expect(result.value?.amount).toBe(500000)
    expect(result.value?.currency).toBe('JPY')
  })

  it('returns undefined value for non-numeric amount', () => {
    // amount is typed as number, so undefined is the absent case
    expect(transformDeal(makeRaw()).value).toBeUndefined()
  })

  it('maps customer.id to company_id as string', () => {
    expect(transformDeal(makeRaw({ customer: { id: 20, name: 'Acme' } })).company_id).toBe('20')
  })

  it('maps expectedContractDate to close_date', () => {
    const result = transformDeal(makeRaw({ expectedContractDate: '2024-12-31T00:00:00.000Z' }))
    expect(result.close_date).toBe('2024-12-31T00:00:00.000Z')
  })

  it('maps createdAt to IsoDatetime', () => {
    const result = transformDeal(makeRaw({ createdAt: '2024-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2024-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation', () => {
    const raw: RawMazricaDeal = {
      id: 1,
      name: 'Enterprise License',
      amount: 1000000,
      expectedContractDate: '2024-12-31T00:00:00.000Z',
      customer: { id: 20, name: 'Acme Japan' },
      createdAt: '2024-01-15T09:30:00.000Z',
      updatedAt: '2024-02-01T14:20:00.000Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('mazrica untransformDeal', () => {
  it('maps title to name', () => {
    expect(untransformDeal({ title: 'Enterprise deal' }).name).toBe('Enterprise deal')
  })

  it('maps value.amount to amount', () => {
    expect(untransformDeal({ value: { amount: 500000, currency: 'JPY' } }).amount).toBe(500000)
  })

  it('maps close_date to expectedContractDate', () => {
    expect(untransformDeal({ close_date: '2024-12-31T00:00:00.000Z' }).expectedContractDate).toBe(
      '2024-12-31T00:00:00.000Z',
    )
  })

  it('maps company_id to numeric customerId', () => {
    expect(untransformDeal({ company_id: '20' }).customerId).toBe(20)
  })
})
