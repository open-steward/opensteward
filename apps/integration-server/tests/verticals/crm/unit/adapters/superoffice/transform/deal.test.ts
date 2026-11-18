/**
 * Entity fixture from SuperOffice.CRM.Services.SaleEntity (openapi-v3-Sale.json,
 * GET /api/v1/Sale/{id}); row fixture from the "FindSale" archive columns
 * (archive-providers/reference/findsale) in the documented archive row shape.
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  transformDealRow,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/superoffice/transform/deal'

const SALE = {
  SaleId: 500,
  Heading: 'Enterprise License',
  Amount: 250000,
  Currency: { Id: 1, Value: 'NOK' },
  Status: 'Open',
  Rating: { Id: 3, Value: 'Negotiation' },
  SaleType: { Id: 4, Value: 'Licence sale' },
  Contact: { ContactId: 77 },
  Person: { PersonId: 123 },
  Associate: { AssociateId: 12 },
  Saledate: '2024-06-30T00:00:00+02:00',
  Probability: 60,
  CreatedDate: '2024-01-05T10:00:00',
  UpdatedDate: '2024-02-06T10:00:00',
}

describe('superoffice transformDeal (SaleEntity)', () => {
  it('maps the documented SaleEntity fields', () => {
    const d = DealSchema.parse(transformDeal(SALE))
    expect(d).toMatchObject({
      id: '500',
      title: 'Enterprise License',
      status: 'Open',
      stage: 'Negotiation',
      stage_id: '3',
      pipeline_id: '4',
      contact_ids: ['123'],
      company_id: '77',
      owner_id: '12',
      close_date: '2024-06-30T00:00:00+02:00',
      probability: 60,
      created_at: '2024-01-05T10:00:00Z',
      updated_at: '2024-02-06T10:00:00Z',
    })
    expect(d.metadata).toEqual(SALE)
  })

  it('serves no value: the currency list item is not an ISO code', () => {
    expect(transformDeal(SALE).value).toBeUndefined()
  })

  it('drops a probability outside 0-100 instead of serving it', () => {
    expect(transformDeal({ ...SALE, Probability: 150 }).probability).toBeUndefined()
    expect(transformDeal({ ...SALE, Probability: -1 }).probability).toBeUndefined()
    expect(transformDeal({ ...SALE, Probability: 100 }).probability).toBe(100)
    expect(transformDeal({ ...SALE, Probability: 0 }).probability).toBe(0)
  })

  it('drops a sale date without an offset instead of guessing its zone', () => {
    expect(transformDeal({ ...SALE, Saledate: '2024-06-30T00:00:00' }).close_date).toBeUndefined()
  })

  it('throws without an id or Heading', () => {
    expect(() => transformDeal({ Heading: 'x' })).toThrow(/no id/)
    expect(() => transformDeal({ SaleId: 1 })).toThrow(/no Heading/)
  })

  it('untransforms deal data (write path unchanged)', () => {
    expect(untransformDeal({ title: 'New Sale' }).Heading).toBe('New Sale')
  })
})

describe('superoffice transformDealRow (FindSale archive)', () => {
  const ROW = {
    PrimaryKey: '500',
    EntityName: 'sale',
    heading: 'Enterprise License',
    saleStatus: 'Open',
    stageName: 'Negotiation',
    saleTypeId: 4,
    probPercent: '60',
    date: '2024-06-30T00:00:00',
    registeredDate: '2024-01-05T10:00:00',
    updatedDate: '2024-02-06T10:00:00',
  }

  it('maps the selected columns', () => {
    const d = DealSchema.parse(transformDealRow(ROW))
    expect(d).toMatchObject({
      id: '500',
      title: 'Enterprise License',
      status: 'Open',
      stage: 'Negotiation',
      pipeline_id: '4',
      probability: 60,
      created_at: '2024-01-05T10:00:00Z',
      updated_at: '2024-02-06T10:00:00Z',
    })
    expect(d.close_date).toBeUndefined()
    expect(d.value).toBeUndefined()
    expect(d.metadata).toEqual(ROW)
  })

  it('throws on a row without a heading', () => {
    expect(() => transformDealRow({ PrimaryKey: '1' })).toThrow(/no heading/)
  })
})
