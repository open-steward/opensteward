import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type BexioSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/salesorder'

function makeSalesOrder(overrides: Partial<BexioSalesOrder> = {}): BexioSalesOrder {
  return {
    id: 303,
    document_nr: 'SO-303',
    contact_id: 11,
    currency_id: 1,
    currency_code: 'CHF',
    is_valid_from: '2024-01-15',
    kb_item_status: 'open',
    total_gross: 6000,
    total_taxes: 450,
    positions: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id to string id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('303')
  })

  it('maps contact_id to contactId as string', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('11')
  })

  it('maps currency_code to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('CHF')
  })

  it('maps total_gross to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(6000)
  })

  it('parses is_valid_from as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps open status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ kb_item_status: 'open' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ kb_item_status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps done status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ kb_item_status: 'done' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ kb_item_status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ kb_item_status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps positions to lineItems', () => {
    const raw = makeSalesOrder({
      positions: [
        {
          id: '30',
          article_id: 'art-3',
          text: 'Service C',
          amount: 1,
          unit_price: 1000,
          position_total: 1000,
          tax_id: 'vat-3',
          tax_value: 77,
          account_id: 'acc-70',
          discount: 50,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('30')
    expect(li.itemId).toBe('art-3')
    expect(li.itemDescription).toBe('Service C')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(1)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(77)
    expect(li.taxrateId).toBe('vat-3')
    expect(li.accountId).toBe('acc-70')
    expect(li.discountAmount).toBe(50)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
