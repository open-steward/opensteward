import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type ZohoBooksCreditNote,
  type ZohoBooksCreditNoteLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/creditmemo'

function makeCreditNoteLineItem(overrides: Partial<ZohoBooksCreditNoteLineItem> = {}): ZohoBooksCreditNoteLineItem {
  return {
    line_item_id: 'li-1',
    item_id: 'item-1',
    description: 'Returned Goods',
    rate: 100,
    quantity: 3,
    item_total: 300,
    tax_amount: 30,
    account_id: 'acct-10',
    ...overrides,
  }
}

function makeCreditNote(overrides: Partial<ZohoBooksCreditNote> = {}): ZohoBooksCreditNote {
  return {
    creditnote_id: 'cn-001',
    creditnote_number: 'CN-2024-001',
    customer_id: 'cust-55',
    date: '2024-04-15',
    currency_code: 'EUR',
    total: 330,
    balance: 330,
    tax_total: 30,
    status: 'open',
    line_items: [makeCreditNoteLineItem()],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps creditnote_id to id', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('cn-001')
  })

  it('maps creditnote_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps customer_id to contactId', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('cust-55')
  })

  it('maps currency_code to currency', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(330)
  })

  it('maps tax_total to taxAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).taxAmount).toBe(30)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).balanceAmount).toBe(330)
  })

  it('parses date as postedAt Date object', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-04-15'))
  })

  it('maps status draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status open to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status closed to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'closed' })).status).toBe('PAID')
  })

  it('maps status void to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps line_items to lineItems', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Returned Goods')
    expect(result.lineItems![0].unitQuantity).toBe(3)
    expect(result.lineItems![0].totalAmount).toBe(300)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditNote()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
