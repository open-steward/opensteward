import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawSpiroOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/spiro/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { OPPORTUNITIES_LIST, OPPORTUNITY_GET } from '../fixtures'

const LISTED: RawSpiroOpportunity = OPPORTUNITIES_LIST.data[0]

function withAttrs(attrs: Partial<RawSpiroOpportunity['attributes']>): RawSpiroOpportunity {
  return { ...LISTED, attributes: { ...LISTED.attributes, ...attrs } }
}

describe('spiro transformDeal (documented GET /api/v1/opportunities example)', () => {
  it('parses against DealSchema with every documented field in place', () => {
    const d = DealSchema.parse(transformDeal(LISTED))
    expect(d).toMatchObject({
      id: '117',
      title: 'Ernser-Lueilwitz',
      stage_id: '367',
      pipeline_id: '126',
      company_id: '478',
      owner_id: '1061',
      created_at: '2026-09-01T09:57:39.426Z',
      updated_at: '2026-09-01T09:57:39.426Z',
    })
    expect(d.metadata).toEqual(LISTED)
  })

  it('assumes no currency: the documented currency is null, so no value', () => {
    expect(LISTED.attributes.currency).toBeNull()
    expect(transformDeal(LISTED).value).toBeUndefined()
  })

  it('carries the amount as stated, in major units, when the record has an ISO currency', () => {
    const d = DealSchema.parse(transformDeal(withAttrs({ currency: 'EUR' })))
    expect(d.value).toEqual({ amount: 6236.41, currency: 'EUR' })
  })

  it('drops a value whose currency is not an ISO 4217 code', () => {
    expect(transformDeal(withAttrs({ currency: 'Euro' })).value).toBeUndefined()
  })

  it('drops a value whose amount is null or blank', () => {
    expect(transformDeal(withAttrs({ currency: 'EUR', amount: null })).value).toBeUndefined()
    expect(transformDeal(withAttrs({ currency: 'EUR', amount: '' })).value).toBeUndefined()
  })

  it('does not turn the calendar close_at into an invented instant', () => {
    expect(transformDeal(LISTED).close_date).toBeUndefined()
  })

  it('reads the GET-by-id document the same way', () => {
    const d = DealSchema.parse(transformDeal(OPPORTUNITY_GET.data))
    expect(d.id).toBe('118')
    expect(d.stage_id).toBe('370')
  })
})

describe('spiro untransformDeal', () => {
  it('maps title back to name', () => {
    const result = untransformDeal({ title: 'Big Deal' })
    expect(result.name).toBe('Big Deal')
  })

  it('writes back the amount in the unit transformDeal reads it', () => {
    const read = transformDeal({ ...LISTED, attributes: { ...LISTED.attributes, currency: 'EUR' } })
    expect(untransformDeal({ value: read.value })).toMatchObject({
      amount: 6236.41,
      currency: 'EUR',
    })
  })

  it('maps deal_id via opportunity_id round-trip', () => {
    // untransformDeal maps contact_ids back directly
    const result = untransformDeal({ contact_ids: ['1', '2'] })
    expect(result.contact_ids).toEqual(['1', '2'])
  })
})
