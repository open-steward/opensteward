import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type ZohoBooksQuote,
  type ZohoBooksQuoteLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/order'

function makeQuoteLineItem(overrides: Partial<ZohoBooksQuoteLineItem> = {}): ZohoBooksQuoteLineItem {
  return {
    line_item_id: 'li-1',
    item_id: 'item-5',
    description: 'Consulting Services',
    rate: 150,
    quantity: 8,
    item_total: 1200,
    tax_amount: 120,
    account_id: 'acct-20',
    ...overrides,
  }
}

function makeQuote(overrides: Partial<ZohoBooksQuote> = {}): ZohoBooksQuote {
  return {
    quote_id: 'qt-001',
    quote_number: 'QT-2024-001',
    customer_id: 'cust-11',
    date: '2024-07-01',
    expiry_date: '2024-07-31',
    currency_code: 'GBP',
    total: 1320,
    status: 'sent',
    line_items: [makeQuoteLineItem()],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps quote_id to id', () => {
    expect(transformOrder(makeQuote()).id).toBe('qt-001')
  })

  it('maps customer_id to contactId', () => {
    expect(transformOrder(makeQuote()).contactId).toBe('cust-11')
  })

  it('maps currency_code to currency', () => {
    expect(transformOrder(makeQuote()).currency).toBe('GBP')
  })

  it('maps total to totalAmount', () => {
    expect(transformOrder(makeQuote()).totalAmount).toBe(1320)
  })

  it('always sets type to SALES', () => {
    expect(transformOrder(makeQuote()).type).toBe('SALES')
  })

  it('parses date as postedAt Date object', () => {
    expect(transformOrder(makeQuote()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('maps status draft to ACTIVE', () => {
    expect(transformOrder(makeQuote({ status: 'draft' })).status).toBe('ACTIVE')
  })

  it('maps status sent to ACTIVE', () => {
    expect(transformOrder(makeQuote({ status: 'sent' })).status).toBe('ACTIVE')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformOrder(makeQuote({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status accepted to COMPLETED', () => {
    expect(transformOrder(makeQuote({ status: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps status declined to CANCELLED', () => {
    expect(transformOrder(makeQuote({ status: 'declined' })).status).toBe('CANCELLED')
  })

  it('maps status expired to CANCELLED', () => {
    expect(transformOrder(makeQuote({ status: 'expired' })).status).toBe('CANCELLED')
  })

  it('maps line_items to lineItems', () => {
    const result = transformOrder(makeQuote())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Consulting Services')
    expect(result.lineItems![0].unitQuantity).toBe(8)
    expect(result.lineItems![0].totalAmount).toBe(1200)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeQuote()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeQuote())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
