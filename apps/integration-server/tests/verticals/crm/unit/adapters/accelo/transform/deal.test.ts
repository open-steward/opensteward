import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawAcceloProspect,
} from '../../../../../../../src/verticals/crm/adapters/accelo/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawAcceloProspect> = {}): RawAcceloProspect {
  return { id: 'pro-1', ...overrides }
}

describe('accelo transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 77 })).id).toBe('77')
  })

  it('maps title', () => {
    expect(transformDeal(makeRaw({ title: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('converts major-unit value to minor-unit integer', () => {
    // 50000 => 5_000_000 cents
    const result = transformDeal(makeRaw({ value: '50000' }))
    expect(result.value?.amount).toBe(5000000)
    expect(result.value?.currency).toBe('USD')
  })

  it('handles numeric value', () => {
    const result = transformDeal(makeRaw({ value: 1234.56 }))
    expect(result.value?.amount).toBe(123456)
  })

  it('maps manager_id to owner_id', () => {
    expect(transformDeal(makeRaw({ manager_id: 5 })).owner_id).toBe('5')
  })

  it('maps contact_id to contact_ids array', () => {
    const result = transformDeal(makeRaw({ contact_id: '99' }))
    expect(result.contact_ids).toEqual(['99'])
  })

  it('maps company_id to string', () => {
    expect(transformDeal(makeRaw({ company_id: 33 })).company_id).toBe('33')
  })

  it('maps string status to status label', () => {
    expect(transformDeal(makeRaw({ status: 'Active' })).status).toBe('Active')
  })

  it('maps object status to title', () => {
    const result = transformDeal(makeRaw({ status: { id: '1', title: 'Qualifying' } }))
    expect(result.status).toBe('Qualifying')
  })

  it('normalises probability from plain percentage number', () => {
    expect(transformDeal(makeRaw({ probability: 75 })).probability).toBe(75)
  })

  it('normalises probability from object with percentage field', () => {
    const result = transformDeal(makeRaw({ probability: { id: '3', percentage: '60' } }))
    expect(result.probability).toBe(60)
  })

  it('clamps probability to [0, 100]', () => {
    expect(transformDeal(makeRaw({ probability: 150 })).probability).toBe(100)
    expect(transformDeal(makeRaw({ probability: -10 })).probability).toBe(0)
  })

  it('converts unix timestamp date_created to ISO', () => {
    const result = transformDeal(makeRaw({ date_created: 1737000000 }))
    expect(result.created_at).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('passes DealSchema.parse without throwing', () => {
    const raw = makeRaw({
      id: '10',
      title: 'Acme Q1 Expansion',
      value: '50000',
      status: { id: '1', title: 'Active' },
      manager_id: 5,
      contact_id: '99',
      company_id: 33,
      probability: 60,
      date_created: 1737000000,
      date_modified: 1737086400,
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('accelo untransformDeal', () => {
  it('maps title back', () => {
    expect(untransformDeal({ title: 'Big Deal' }).title).toBe('Big Deal')
  })

  it('converts minor-unit amount back to major-unit string', () => {
    const result = untransformDeal({ value: { amount: 5000000, currency: 'USD' } })
    expect(result.value).toBe('50000.00')
  })

  it('maps owner_id back to manager_id', () => {
    expect(untransformDeal({ owner_id: '5' }).manager_id).toBe('5')
  })

  it('maps first contact_ids entry back to contact_id', () => {
    expect(untransformDeal({ contact_ids: ['c-1', 'c-2'] }).contact_id).toBe('c-1')
  })

  it('maps probability back as string', () => {
    expect(untransformDeal({ probability: 75 }).probability).toBe('75')
  })

  it('round-trips title and value', () => {
    const raw = makeRaw({ title: 'Round-trip Deal', value: '1000' })
    const canonical = transformDeal(raw)
    const back = untransformDeal(canonical)
    expect(back.title).toBe('Round-trip Deal')
    expect(back.value).toBe('1000.00')
  })
})
