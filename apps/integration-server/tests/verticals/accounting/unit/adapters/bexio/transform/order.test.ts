import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type BexioOrder,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/order'

function makeOrder(overrides: Partial<BexioOrder> = {}): BexioOrder {
  return {
    id: 101,
    document_nr: 'ORD-101',
    contact_id: 5,
    currency_id: 1,
    currency_code: 'CHF',
    is_valid_from: '2024-01-15',
    kb_item_status: 'open',
    total_gross: 8000,
    total_taxes: 600,
    positions: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id to string id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('101')
  })

  it('maps contact_id to contactId as string', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('5')
  })

  it('maps currency_code to currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('CHF')
  })

  it('maps total_gross to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(8000)
  })

  it('sets type to SALES', () => {
    const result = transformOrder(makeOrder())
    expect(result.type).toBe('SALES')
  })

  it('parses is_valid_from as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps open status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ kb_item_status: 'open' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformOrder(makeOrder({ kb_item_status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps done status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ kb_item_status: 'done' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformOrder(makeOrder({ kb_item_status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ kb_item_status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps positions to lineItems', () => {
    const raw = makeOrder({
      positions: [
        {
          id: '10',
          article_id: 'art-1',
          text: 'Widget A',
          amount: 4,
          unit_price: 200,
          position_total: 800,
          tax_id: 'vat-1',
          tax_value: 60,
          account_id: 'acc-50',
          discount: 0,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemId).toBe('art-1')
    expect(li.itemDescription).toBe('Widget A')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(4)
    expect(li.totalAmount).toBe(800)
    expect(li.taxAmount).toBe(60)
    expect(li.taxrateId).toBe('vat-1')
    expect(li.accountId).toBe('acc-50')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
