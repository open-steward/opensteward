import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawSalesmateDeal,
} from '../../../../../../../src/verticals/crm/adapters/salesmate/transform/deal'

/**
 * "Get a deal" publishes no example body. Built from the documented "Add a
 * deal" body (values verbatim: "title": "Bags Deal with VIP", "dealValue":
 * "7410000", "estimatedCloseDate": "2024-11-24T12:40:00Z", "pipeline":
 * "Sellers", "currency": "AED", "status": "Open", "stage": "Listing Agreement
 * Signed"; add response "id": 341), with related records in the
 * `deal.owner.id` / `deal.primaryContact.id` / `deal.primaryCompany.id` shape
 * the Search a deal body names. No deal response is documented, so the
 * createdAt / lastModifiedAt values and the `{ id }` ref-object shape are the
 * documented Get a Contact response's ("createdAt": "2020-08-21T11:51:34.000Z",
 * "lastModifiedAt": "2023-07-14T07:15:38.000Z", "owner": { "id": 1, … }).
 */
function documentedDeal(): RawSalesmateDeal {
  return {
    id: 341,
    title: 'Bags Deal with VIP',
    primaryContact: { id: 1594 },
    primaryCompany: { id: 1 },
    owner: { id: 1 },
    source: 'Ads',
    dealValue: '7410000',
    estimatedCloseDate: '2024-11-24T12:40:00Z',
    pipeline: 'Sellers',
    currency: 'AED',
    status: 'Open',
    priority: 'High',
    stage: 'Listing Agreement Signed',
    createdAt: '2020-08-21T11:51:34.000Z',
    lastModifiedAt: '2023-07-14T07:15:38.000Z',
  }
}

describe('salesmate transformDeal', () => {
  it('maps a documented deal and passes DealSchema', () => {
    const out = DealSchema.parse(transformDeal(documentedDeal()))
    expect(out).toMatchObject({
      id: '341',
      title: 'Bags Deal with VIP',
      value: { amount: 7410000, currency: 'AED' },
      status: 'Open',
      stage: 'Listing Agreement Signed',
      contact_ids: ['1594'],
      company_id: '1',
      owner_id: '1',
      close_date: '2024-11-24T12:40:00.000Z',
      created_at: '2020-08-21T11:51:34.000Z',
      updated_at: '2023-07-14T07:15:38.000Z',
    })
  })

  it('omits a negative dealValue, which MoneySchema (amount ≥ 0) cannot hold', () => {
    const out = DealSchema.parse(transformDeal({ ...documentedDeal(), dealValue: -5 }))
    expect(out.value).toBeUndefined()
    expect(out.id).toBe('341')
  })

  it('reads a currency object as documented on responses ({ code })', () => {
    const out = transformDeal({ ...documentedDeal(), dealValue: 12.5, currency: { code: 'USD' } })
    expect(out.value).toEqual({ amount: 12.5, currency: 'USD' })
  })

  it('omits value when the currency is missing, never defaulting one', () => {
    const raw = documentedDeal()
    delete raw.currency
    expect(transformDeal(raw).value).toBeUndefined()
  })

  it('omits value when dealValue is empty, never writing 0', () => {
    expect(transformDeal({ ...documentedDeal(), dealValue: '' }).value).toBeUndefined()
  })

  it('does not guess a pipeline_id or stage_id from the pipeline and stage names', () => {
    const out = transformDeal(documentedDeal())
    expect(out.pipeline_id).toBeUndefined()
    expect(out.stage_id).toBeUndefined()
  })

  it('drops a close date with no documented zone ("Apr 04, 2018")', () => {
    expect(
      transformDeal({ ...documentedDeal(), estimatedCloseDate: 'Apr 04, 2018' }).close_date,
    ).toBeUndefined()
  })

  it('throws when the required title is missing', () => {
    const raw = documentedDeal()
    delete raw.title
    expect(() => transformDeal(raw)).toThrow(/no title/)
  })
})

describe('salesmate untransformDeal', () => {
  it('maps value.amount to dealValue', () => {
    expect(untransformDeal({ value: { amount: 999, currency: 'USD' } }).dealValue).toBe(999)
  })
})
