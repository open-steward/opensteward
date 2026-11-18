import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawTotangoDeal,
} from '../../../../../../../src/verticals/crm/adapters/totango/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawTotangoDeal> = {}): RawTotangoDeal {
  return { id: 'deal-1', name: 'Deal', ...overrides }
}

describe('totango transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps name to title', () => {
    const result = transformDeal(makeRaw({ name: 'Enterprise Contract' }))
    expect(result.title).toBe('Enterprise Contract')
  })

  it('falls back to account_name when name absent', () => {
    const result = transformDeal(makeRaw({ name: undefined, account_name: 'Acme' }))
    expect(result.title).toBe('Acme')
  })

  it('converts contract_value from major units to minor units', () => {
    const result = transformDeal(makeRaw({ contract_value: 5000, currency: 'USD' }))
    expect(result.value?.amount).toBe(500000)
    expect(result.value?.currency).toBe('USD')
  })

  it('defaults currency to USD when absent', () => {
    const result = transformDeal(makeRaw({ contract_value: 1000 }))
    expect(result.value?.currency).toBe('USD')
  })

  it('handles contract_value as string', () => {
    const result = transformDeal(makeRaw({ contract_value: '2500.50' }))
    expect(result.value?.amount).toBe(250050)
  })

  it('lowercases status_group for status', () => {
    const result = transformDeal(makeRaw({ status_group: 'Paying' }))
    expect(result.status).toBe('paying')
  })

  it('maps account_id to company_id', () => {
    const result = transformDeal(makeRaw({ account_id: 'acc-7' }))
    expect(result.company_id).toBe('acc-7')
  })

  it('maps csm to owner_id', () => {
    const result = transformDeal(makeRaw({ csm: 'csm@example.com' }))
    expect(result.owner_id).toBe('csm@example.com')
  })

  it('converts epoch-ms create_date to ISO', () => {
    const result = transformDeal(makeRaw({ create_date: 1736930200000 }))
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation', () => {
    const raw = makeRaw({
      id: 'deal-1',
      name: 'Enterprise Contract',
      contract_value: 5000,
      currency: 'USD',
      status_group: 'Paying',
      account_id: 'acc-7',
      csm: 'csm@example.com',
      create_date: 1736930200000,
      update_date: 1738415200000,
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('totango untransformDeal', () => {
  it('maps title back to name', () => {
    const result = untransformDeal({ title: 'Enterprise Contract' })
    expect(result.name).toBe('Enterprise Contract')
  })

  it('converts amount from minor units back to major units', () => {
    const result = untransformDeal({ value: { amount: 500000, currency: 'USD' } })
    expect(result.contract_value).toBe(5000)
    expect(result.currency).toBe('USD')
  })

  it('maps company_id back to account_id', () => {
    const result = untransformDeal({ company_id: 'acc-7' })
    expect(result.account_id).toBe('acc-7')
  })

  it('maps owner_id back to csm', () => {
    const result = untransformDeal({ owner_id: 'csm@example.com' })
    expect(result.csm).toBe('csm@example.com')
  })

  it('omits undefined fields', () => {
    const result = untransformDeal({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
