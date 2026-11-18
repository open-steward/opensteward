import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawDayliteOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/daylite/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawDayliteOpportunity> = {}): RawDayliteOpportunity {
  return { self: '/v1/opportunities/1', name: 'Big Deal', ...overrides }
}

describe('daylite transformDeal', () => {
  it('extracts id from self URL', () => {
    expect(transformDeal(makeRaw({ self: '/v1/opportunities/55' })).id).toBe('55')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Enterprise Expansion' })).title).toBe(
      'Enterprise Expansion',
    )
  })

  it('defaults title to empty string when name absent', () => {
    expect(transformDeal(makeRaw({ name: undefined })).title).toBe('')
  })

  it('passes total as value.amount (already integer minor units)', () => {
    // total is stored as integer minor units; transform passes it as-is to amount
    const result = transformDeal(makeRaw({ total: 5000000 }))
    expect(result.value?.amount).toBe(5000000)
  })

  it('defaults currency to USD when not present', () => {
    const result = transformDeal(makeRaw({ total: 100 }))
    expect(result.value?.currency).toBe('USD')
  })

  it('uses provided currency when present', () => {
    const result = transformDeal(makeRaw({ total: 100, currency: 'EUR' }))
    expect(result.value?.currency).toBe('EUR')
  })

  it('maps state to status', () => {
    const result = transformDeal(makeRaw({ state: 'won' }))
    expect(result.status).toBe('won')
  })

  it('extracts stage_id from current_pipeline_stage URL', () => {
    const result = transformDeal(makeRaw({ current_pipeline_stage: '/v1/pipeline_stages/3' }))
    expect(result.stage_id).toBe('3')
  })

  it('extracts pipeline_id from current_pipeline URL', () => {
    const result = transformDeal(makeRaw({ current_pipeline: '/v1/pipelines/1' }))
    expect(result.pipeline_id).toBe('1')
  })

  it('maps probability', () => {
    const result = transformDeal(makeRaw({ probability: 75 }))
    expect(result.probability).toBe(75)
  })

  it('maps forecasted to close_date', () => {
    const result = transformDeal(makeRaw({ forecasted: '2026-06-30T00:00:00.000Z' }))
    expect(result.close_date).toBe('2026-06-30T00:00:00.000Z')
  })

  it('extracts contact_ids from string URL contacts', () => {
    const result = transformDeal(makeRaw({ contacts: ['/v1/contacts/10', '/v1/contacts/20'] }))
    expect(result.contact_ids).toEqual(['10', '20'])
  })

  it('extracts contact_ids from role-object contacts', () => {
    const result = transformDeal(makeRaw({ contacts: [{ contact: '/v1/contacts/10' }] }))
    expect(result.contact_ids).toEqual(['10'])
  })

  it('extracts company_id from first companies entry (string URL)', () => {
    const result = transformDeal(makeRaw({ companies: ['/v1/companies/99'] }))
    expect(result.company_id).toBe('99')
  })

  it('extracts owner_id from owner URL', () => {
    const result = transformDeal(makeRaw({ owner: '/v1/users/7' }))
    expect(result.owner_id).toBe('7')
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces a DealSchema-valid result', () => {
    const raw = makeRaw({
      self: '/v1/opportunities/1',
      name: 'Big Deal',
      total: 5000,
      state: 'open',
      forecasted: '2026-06-30T00:00:00.000Z',
      create_date: '2026-01-01T00:00:00.000Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('daylite untransformDeal', () => {
  it('maps title → name', () => {
    const out = untransformDeal({ title: 'Enterprise Expansion' })
    expect(out.name).toBe('Enterprise Expansion')
  })

  it('maps value.amount → total as integer', () => {
    const out = untransformDeal({ value: { amount: 5000.9, currency: 'USD' } })
    expect(out.total).toBe(5001)
  })

  it('maps stage_id → current_pipeline_stage URL', () => {
    const out = untransformDeal({ stage_id: '3' })
    expect(out.current_pipeline_stage).toBe('/v1/pipeline_stages/3')
  })

  it('maps pipeline_id → current_pipeline URL', () => {
    const out = untransformDeal({ pipeline_id: '1' })
    expect(out.current_pipeline).toBe('/v1/pipelines/1')
  })

  it('maps owner_id → owner URL', () => {
    const out = untransformDeal({ owner_id: '7' })
    expect(out.owner).toBe('/v1/users/7')
  })

  it('maps status → state', () => {
    const out = untransformDeal({ status: 'won' })
    expect(out.state).toBe('won')
  })
})
