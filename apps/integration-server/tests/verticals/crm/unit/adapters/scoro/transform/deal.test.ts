/**
 * Fixture fields from the Quotes table at https://api.scoro.com/api/v2 (id,
 * quote_name, sum, currency, status, company_id, person_id, owner_id,
 * created_date / modified_date "Datetime (YYYY-mm-dd HH:ii:ss)"); status is one
 * of the documented "approved, completed, declined, incomplete, pending, ready".
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/scoro/transform/deal'

const QUOTE = {
  id: 12,
  no: 1001,
  quote_name: 'Tutorial OÜ quote',
  sum: '1250.50',
  vat_sum: '250.10',
  currency: 'EUR',
  status: 'pending',
  company_id: 30,
  person_id: 31,
  owner_id: 1,
  estimated_closing_date: '2018-04-14',
  created_date: '2018-04-01 10:00:00',
  modified_date: '2018-04-02 11:00:00',
  lines: null,
}

describe('scoro transformDeal', () => {
  it('maps the documented quote fields and parses with DealSchema', () => {
    const deal = DealSchema.parse(transformDeal(QUOTE))
    expect(deal).toMatchObject({
      id: '12',
      title: 'Tutorial OÜ quote',
      value: { amount: 1250.5, currency: 'EUR' },
      status: 'pending',
      company_id: '30',
      contact_ids: ['31'],
      owner_id: '1',
    })
    // Offset-less "YYYY-mm-dd HH:ii:ss" and date-only fields stay in metadata.
    expect(deal.created_at).toBeUndefined()
    expect(deal.updated_at).toBeUndefined()
    expect(deal.close_date).toBeUndefined()
    expect(deal.metadata).toEqual(QUOTE)
  })

  it('omits value when currency or sum is missing, never defaulting either', () => {
    expect(DealSchema.parse(transformDeal({ ...QUOTE, currency: null })).value).toBeUndefined()
    expect(DealSchema.parse(transformDeal({ ...QUOTE, sum: null })).value).toBeUndefined()
  })

  it('omits a negative sum, which the canonical Money rejects', () => {
    expect(DealSchema.parse(transformDeal({ ...QUOTE, sum: '-5.00' })).value).toBeUndefined()
  })

  it('reads a numeric sum', () => {
    expect(transformDeal({ ...QUOTE, sum: 99 }).value).toEqual({ amount: 99, currency: 'EUR' })
  })

  it('throws instead of inventing a title or id', () => {
    expect(() => transformDeal({ id: 1 })).toThrow(/quote_name/)
    expect(() => transformDeal({ quote_name: 'x' })).toThrow(/no id/)
  })

  it('untransformDeal keeps its (unrebuilt) write shape', () => {
    expect(untransformDeal({ title: 'X', company_id: '3' })).toEqual({ name: 'X', company_id: '3' })
  })
})
