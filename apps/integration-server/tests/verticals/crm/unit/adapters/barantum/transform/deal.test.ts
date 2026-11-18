import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawBarantumDeal,
} from '../../../../../../../src/verticals/crm/adapters/barantum/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { DOC_DEAL } from '../fixtures/documented'

const doc = (overrides: Partial<RawBarantumDeal> = {}): RawBarantumDeal => ({
  ...DOC_DEAL,
  ...overrides,
})

describe('barantum transformDeal (documented Deals row)', () => {
  it('parses against DealSchema', () => {
    const d = DealSchema.parse(transformDeal(doc()))
    expect(d.id).toBe('0f1a6b95-80d5-48a2-905e-3f6bc70625e5')
    expect(d.title).toBe('Test')
    expect(d.stage).toBe('Lead In')
    expect(d.company_id).toBeUndefined()
    expect(d.metadata).toEqual(DOC_DEAL)
  })

  it('reads the stage label from sales_stage_name, not the numeric-id deals_sales_stage', () => {
    // Docs: deals_sales_stage is "Sales stage (numeric ID)", sent as 17 in Save Data.
    const d = DealSchema.parse(transformDeal(doc({ deals_sales_stage: 17 })))
    expect(d.stage).toBe('Lead In')
    expect(d.stage_id).toBeUndefined()
    expect(transformDeal(doc({ sales_stage_name: null })).stage).toBeUndefined()
  })

  it('omits value: currency_serial_id "Rp." is not an ISO 4217 code', () => {
    expect(transformDeal(doc()).value).toBeUndefined()
  })

  it('omits the zone-less close and audit dates', () => {
    const d = transformDeal(doc())
    expect(d.close_date).toBeUndefined()
    expect(d.created_at).toBeUndefined()
    expect(d.updated_at).toBeUndefined()
  })

  it('maps a set deals_organization_uuid to company_id', () => {
    const d = DealSchema.parse(
      transformDeal(doc({ deals_organization_uuid: 'd4e2a745-82fa-4b58-8490-f682bff30959' })),
    )
    expect(d.company_id).toBe('d4e2a745-82fa-4b58-8490-f682bff30959')
  })

  it('throws on a row with no deals_uuid or no deals_name', () => {
    expect(() => transformDeal(doc({ deals_uuid: '' }))).toThrow(/deals_uuid/)
    expect(() => transformDeal(doc({ deals_name: '' }))).toThrow(/deals_name/)
  })
})

describe('barantum untransformDeal', () => {
  it('maps title back to name', () => {
    expect(untransformDeal({ title: 'Big Deal' }).name).toBe('Big Deal')
  })

  it('passes the major-unit amount and its currency through unscaled', () => {
    const result = untransformDeal({ value: { amount: 300000, currency: 'IDR' } })
    expect(result.value).toBe(300000)
    expect(result.currency).toBe('IDR')
  })

  it('maps status back', () => {
    expect(untransformDeal({ status: 'won' }).status).toBe('won')
  })

  it('maps stage back', () => {
    expect(untransformDeal({ stage: 'Negotiation' }).stage).toBe('Negotiation')
  })

  it('maps pipeline_id back', () => {
    expect(untransformDeal({ pipeline_id: '3' }).pipeline_id).toBe('3')
  })
})
