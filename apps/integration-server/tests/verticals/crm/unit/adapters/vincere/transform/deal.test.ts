/**
 * Vincere job → Deal, over the response examples in Vincere's first-party
 * spec (https://api.vincere.io/vapi.yaml), parsed with the canonical schema.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  transformPositionSearchItem,
  type RawVincereJob,
  type RawVincerePositionSearchItem,
} from '../../../../../../../src/verticals/crm/adapters/vincere/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { DOC_POSITION, DOC_POSITION_SEARCH_ITEMS } from '../fixtures/documented'

const searchItems = DOC_POSITION_SEARCH_ITEMS as unknown as RawVincerePositionSearchItem[]
const detail = DOC_POSITION as unknown as RawVincereJob

describe('vincere transformPositionSearchItem (GET /position/search/{matrix_vars})', () => {
  it('parses every documented example item with DealSchema', () => {
    for (const raw of searchItems) DealSchema.parse(transformPositionSearchItem(raw))
  })

  it('maps the documented search fields', () => {
    const d = DealSchema.parse(transformPositionSearchItem(searchItems[0]!))
    expect(d).toMatchObject({
      id: '170074',
      title: 'New Vacancy_11_A',
      status: 'JOB_OPENED',
      company_id: '32368',
      value: { amount: 0, currency: 'AUD' },
      close_date: '2024-08-24T00:00:00.000Z',
      created_at: '2023-08-24T03:43:17.988Z',
      updated_at: '2023-08-24T03:44:34.071Z',
    })
    expect(d.metadata).toEqual(searchItems[0])
  })

  it('does not map the job contact (a Vincere contact, not a candidate) to contact_ids', () => {
    expect(transformPositionSearchItem(searchItems[0]!).contact_ids).toBeUndefined()
  })

  it('reads the forecast fee as the value', () => {
    const d = transformPositionSearchItem({
      id: 1,
      job_title: 'x',
      forecast_annual_fee: '12500.5',
      forecast_annual_fee_currency: 'gbp',
    })
    expect(d.value).toEqual({ amount: 12500.5, currency: 'GBP' })
  })

  it('omits the value without a currency, or without a fee', () => {
    expect(
      transformPositionSearchItem({ id: 1, job_title: 'x', forecast_annual_fee: '10' }).value,
    ).toBeUndefined()
    expect(
      transformPositionSearchItem({ id: 1, job_title: 'x', forecast_annual_fee_currency: 'aud' })
        .value,
    ).toBeUndefined()
  })

  it('omits a value whose currency is not a three-letter code', () => {
    expect(
      transformPositionSearchItem({
        id: 1,
        job_title: 'x',
        forecast_annual_fee: '10',
        forecast_annual_fee_currency: 'singd',
      }).value,
    ).toBeUndefined()
  })

  it('throws rather than inventing a title', () => {
    expect(() => transformPositionSearchItem({ id: 3 })).toThrow(/job 3 has no job_title/)
  })
})

describe('vincere transformDeal (GET /position/{id})', () => {
  it('parses the documented example with DealSchema', () => {
    const d = DealSchema.parse(transformDeal(detail))
    expect(d).toMatchObject({
      id: '169615',
      title: 'Hourly One Day Placement',
      company_id: '32698',
      close_date: '2024-07-29T00:00:00.000Z',
      created_at: '2023-07-29T07:49:08.535Z',
    })
    // forecast_annual_fee is null in the example: no value.
    expect(d.value).toBeUndefined()
    expect(d.contact_ids).toBeUndefined()
  })

  it('reads updated_timestamp as updated_at', () => {
    // The documented example's updated_timestamp is '2023-07-29'.
    expect(DealSchema.parse(transformDeal(detail)).updated_at).toBe('2023-07-29T00:00:00.000Z')
  })

  it('reads the forecast fee (documented type number) as the value', () => {
    // The example's forecast_annual_fee_currency is 'vnd'; only the fee is set.
    const d = DealSchema.parse(transformDeal({ ...detail, forecast_annual_fee: 5000 }))
    expect(d.value).toEqual({ amount: 5000, currency: 'VND' })
  })

  it('omits a negative fee, which the canonical Money (amount >= 0) cannot hold', () => {
    const d = DealSchema.parse(transformDeal({ ...detail, forecast_annual_fee: -5 }))
    expect(d.value).toBeUndefined()
  })
})
