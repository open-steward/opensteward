import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawVendastaOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/vendasta/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawVendastaOpportunity> = {}): RawVendastaOpportunity {
  return {
    crmObjectId: 'deal_001',
    ownerId: 'usr_owner',
    created: '2026-01-15T09:30:00.000Z',
    updated: '2026-02-01T14:20:00.000Z',
    fields: [
      { fieldId: 'standard__opportunity_name', stringValue: 'Acme Q1 Expansion' },
      { fieldId: 'standard__opportunity_status', stringValue: 'open' },
      { fieldId: 'standard__opportunity_stage', stringValue: 'stage_negotiation' },
      { fieldId: 'standard__opportunity_pipeline_id', stringValue: 'pipe_sales' },
      { fieldId: 'standard__opportunity_close_date', stringValue: '2026-03-31T00:00:00.000Z' },
      {
        fieldId: 'standard__opportunity_value',
        currencyValue: { value: 5000, currencyCode: 'USD' },
      },
      { fieldId: 'standard__opportunity_contact_id', stringValue: 'cont_jane' },
      { fieldId: 'standard__opportunity_company_id', stringValue: 'co_acme' },
      { fieldId: 'system__opportunity_owner_id', stringValue: 'usr_fallback' },
    ],
    ...overrides,
  }
}

describe('vendasta transformDeal', () => {
  it('maps id from crmObjectId', () => {
    expect(transformDeal(makeRaw()).id).toBe('deal_001')
  })

  it('maps title from standard__opportunity_name field', () => {
    expect(transformDeal(makeRaw()).title).toBe('Acme Q1 Expansion')
  })

  it('maps value from currencyValue field', () => {
    const value = transformDeal(makeRaw()).value
    expect(value?.amount).toBe(5000)
    expect(value?.currency).toBe('USD')
  })

  it('maps value from floatValue field', () => {
    const raw = makeRaw({
      fields: [{ fieldId: 'standard__opportunity_value', floatValue: 3000.5 }],
    })
    expect(transformDeal(raw).value?.amount).toBe(3000.5)
  })

  it('maps value from stringValue field', () => {
    const raw = makeRaw({
      fields: [{ fieldId: 'standard__opportunity_value', stringValue: '2500' }],
    })
    expect(transformDeal(raw).value?.amount).toBe(2500)
  })

  it('maps status from standard__opportunity_status field', () => {
    expect(transformDeal(makeRaw()).status).toBe('open')
  })

  it('maps stage_id from standard__opportunity_stage field', () => {
    expect(transformDeal(makeRaw()).stage_id).toBe('stage_negotiation')
  })

  it('maps pipeline_id from standard__opportunity_pipeline_id field', () => {
    expect(transformDeal(makeRaw()).pipeline_id).toBe('pipe_sales')
  })

  it('maps contact_ids as single-element array from standard__opportunity_contact_id', () => {
    expect(transformDeal(makeRaw()).contact_ids).toEqual(['cont_jane'])
  })

  it('maps company_id from standard__opportunity_company_id field', () => {
    expect(transformDeal(makeRaw()).company_id).toBe('co_acme')
  })

  it('maps close_date from standard__opportunity_close_date field', () => {
    expect(transformDeal(makeRaw()).close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('prefers raw.ownerId over system__opportunity_owner_id field', () => {
    expect(transformDeal(makeRaw()).owner_id).toBe('usr_owner')
  })

  it('maps timestamps from raw.created and raw.updated', () => {
    const result = transformDeal(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => DealSchema.parse(transformDeal(makeRaw()))).not.toThrow()
  })

  it('handles missing optional fields without throwing', () => {
    const minimal: RawVendastaOpportunity = { crmObjectId: 'deal_min', fields: [] }
    expect(() => DealSchema.parse(transformDeal(minimal))).not.toThrow()
  })

  it('value is undefined when no value field present', () => {
    const raw = makeRaw({ fields: [] })
    expect(transformDeal(raw).value).toBeUndefined()
  })

  it('contact_ids is undefined when contact field absent', () => {
    const raw = makeRaw({ fields: [] })
    expect(transformDeal(raw).contact_ids).toBeUndefined()
  })
})

describe('vendasta untransformDeal', () => {
  it('maps title to standard__opportunity_name field', () => {
    const fields = untransformDeal({ title: 'Big Deal' })
    const found = fields.find((f) => f.fieldId === 'standard__opportunity_name')
    expect(found?.stringValue).toBe('Big Deal')
  })

  it('maps value using currencyField', () => {
    const fields = untransformDeal({ value: { amount: 5000, currency: 'EUR' } })
    const found = fields.find((f) => f.fieldId === 'standard__opportunity_value')
    expect(found?.currencyValue?.value).toBe(5000)
    expect(found?.currencyValue?.currencyCode).toBe('EUR')
  })

  it('maps contact_ids[0] to standard__opportunity_contact_id field', () => {
    const fields = untransformDeal({ contact_ids: ['cont_jane'] })
    const found = fields.find((f) => f.fieldId === 'standard__opportunity_contact_id')
    expect(found?.stringValue).toBe('cont_jane')
  })

  it('maps close_date to standard__opportunity_close_date field', () => {
    const fields = untransformDeal({ close_date: '2026-03-31T00:00:00.000Z' })
    const found = fields.find((f) => f.fieldId === 'standard__opportunity_close_date')
    expect(found?.stringValue).toBe('2026-03-31T00:00:00.000Z')
  })
})
