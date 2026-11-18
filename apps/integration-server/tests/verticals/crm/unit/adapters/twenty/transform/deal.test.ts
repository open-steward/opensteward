import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/twenty/transform/deal'
import { OPPORTUNITY } from '../fixtures'

describe('twenty transformDeal (Opportunity)', () => {
  it('maps a documented Opportunity record to a schema-valid Deal', () => {
    const out = DealSchema.parse(transformDeal(OPPORTUNITY))
    expect(out).toMatchObject({
      id: OPPORTUNITY.id,
      title: 'Linkedin expansion',
      value: { amount: 1250.5, currency: 'EUR' },
      stage: 'MEETING',
      company_id: OPPORTUNITY.companyId,
      contact_ids: [OPPORTUNITY.pointOfContactId],
      owner_id: OPPORTUNITY.ownerId,
      close_date: '2026-03-31T00:00:00.000Z',
      created_at: OPPORTUNITY.createdAt,
      updated_at: OPPORTUNITY.updatedAt,
    })
    expect(out.metadata).toEqual(OPPORTUNITY)
  })

  it('omits value when amountMicros is null', () => {
    const out = DealSchema.parse(
      transformDeal({ ...OPPORTUNITY, amount: { amountMicros: null, currencyCode: 'EUR' } }),
    )
    expect(out.value).toBeUndefined()
  })

  it('omits value when currencyCode is empty rather than assuming one', () => {
    const out = DealSchema.parse(
      transformDeal({ ...OPPORTUNITY, amount: { amountMicros: 5_000_000, currencyCode: '' } }),
    )
    expect(out.value).toBeUndefined()
  })

  it('omits value when amountMicros is negative (canonical money is non-negative)', () => {
    const out = DealSchema.parse(
      transformDeal({ ...OPPORTUNITY, amount: { amountMicros: -5_000_000, currencyCode: 'EUR' } }),
    )
    expect(out.value).toBeUndefined()
  })

  it('omits value when the amount is null', () => {
    expect(DealSchema.parse(transformDeal({ ...OPPORTUNITY, amount: null })).value).toBeUndefined()
  })

  it('leaves links absent when the join columns are null', () => {
    const out = DealSchema.parse(
      transformDeal({
        ...OPPORTUNITY,
        companyId: null,
        pointOfContactId: null,
        ownerId: null,
        closeDate: null,
      }),
    )
    expect(out.company_id).toBeUndefined()
    expect(out.contact_ids).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
    expect(out.close_date).toBeUndefined()
  })

  it('refuses a record without an id', () => {
    expect(() => transformDeal({ ...OPPORTUNITY, id: undefined })).toThrow(/id/)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Test', status: 'open' })
    expect(result.name).toBe('Test')
    expect(result.stage).toBe('open')
  })
})
