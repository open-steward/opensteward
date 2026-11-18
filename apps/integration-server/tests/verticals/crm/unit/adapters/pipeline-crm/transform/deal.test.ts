import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawPipelineCrmDeal,
} from '../../../../../../../src/verticals/crm/adapters/pipeline-crm/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawPipelineCrmDeal> = {}): RawPipelineCrmDeal {
  return {
    id: 'd-99',
    name: 'Acme Q1 Expansion',
    value: 500,
    currency: 'USD',
    status: 'open',
    stage_id: 'stage-3',
    pipeline_id: 'pipe-1',
    contact_id: 'p-42',
    company_id: 'co-7',
    owner_id: 'usr-1',
    close_date: '2026-03-31T00:00:00.000Z',
    probability: 60,
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('pipeline-crm transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('d-99')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Acme Q1 Expansion')
  })

  it('converts value major units to minor units (cents)', () => {
    // 500 USD → 50000 cents
    expect(transformDeal(makeRaw()).value?.amount).toBe(50000)
  })

  it('maps value currency', () => {
    expect(transformDeal(makeRaw()).value?.currency).toBe('USD')
  })

  it('defaults currency to USD when currency absent', () => {
    const result = transformDeal(makeRaw({ currency: undefined }))
    expect(result.value?.currency).toBe('USD')
  })

  it('handles string value', () => {
    expect(transformDeal(makeRaw({ value: '250.50' })).value?.amount).toBe(25050)
  })

  it('maps status', () => {
    expect(transformDeal(makeRaw()).status).toBe('open')
  })

  it('maps stage_id', () => {
    expect(transformDeal(makeRaw()).stage_id).toBe('stage-3')
  })

  it('maps pipeline_id', () => {
    expect(transformDeal(makeRaw()).pipeline_id).toBe('pipe-1')
  })

  it('maps contact_ids as single-element array from contact_id', () => {
    expect(transformDeal(makeRaw()).contact_ids).toEqual(['p-42'])
  })

  it('maps company_id', () => {
    expect(transformDeal(makeRaw()).company_id).toBe('co-7')
  })

  it('maps owner_id', () => {
    expect(transformDeal(makeRaw()).owner_id).toBe('usr-1')
  })

  it('maps probability', () => {
    expect(transformDeal(makeRaw()).probability).toBe(60)
  })

  it('maps close_date as ISO datetime', () => {
    expect(transformDeal(makeRaw()).close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('maps created_at as ISO datetime', () => {
    expect(transformDeal(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes DealSchema validation', () => {
    expect(() => DealSchema.parse(transformDeal(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal round-trips title to name', () => {
    expect(untransformDeal({ title: 'New Deal' }).name).toBe('New Deal')
  })

  it('untransformDeal converts minor units back to major units', () => {
    // 50000 cents → 500
    const result = untransformDeal({ value: { amount: 50000, currency: 'USD' } })
    expect(result.value).toBe(500)
    expect(result.currency).toBe('USD')
  })
})
