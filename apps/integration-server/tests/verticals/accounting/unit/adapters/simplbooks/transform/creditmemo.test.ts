import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type SimplbooksCreditInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeRaw(overrides: Partial<SimplbooksCreditInvoice> = {}): SimplbooksCreditInvoice {
  return {
    id: 30,
    number: 'CM-030',
    client_id: 5,
    currency: 'EUR',
    total: 2380,
    total_vat: 380,
    paid: 0,
    balance: 2380,
    status: 'sent',
    invoice_date: '2024-03-01',
    due_date: '2024-03-15',
    paid_date: null,
    notes: 'Credit for returned goods',
    rows: [
      {
        id: 1,
        product_id: 42,
        description: 'Widget (returned)',
        quantity: 2,
        unit_price: 1000,
        total: 2380,
        vat_amount: 380,
        account_code: '4000',
      },
    ],
    ...overrides,
  }
}

describe('transformCreditMemo (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('30')
  })

  it('maps number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeRaw()).creditmemoNumber).toBe('CM-030')
  })

  it('maps client_id to contactId string', () => {
    expect(transformCreditMemo(makeRaw()).contactId).toBe('5')
  })

  it('maps total to totalAmount', () => {
    expect(transformCreditMemo(makeRaw()).totalAmount).toBe(2380)
  })

  it('maps total_vat to taxAmount', () => {
    expect(transformCreditMemo(makeRaw()).taxAmount).toBe(380)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformCreditMemo(makeRaw()).balanceAmount).toBe(2380)
  })

  it('maps notes', () => {
    expect(transformCreditMemo(makeRaw()).notes).toBe('Credit for returned goods')
  })

  it('maps invoice_date string to Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps sent + paid=0 to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('maps sent + partial paid to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeRaw({ paid: 1000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps paid to PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps rows to lineItems', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].itemId).toBe('42')
    expect(result.lineItems![0].itemDescription).toBe('Widget (returned)')
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].accountId).toBe('4000')
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeRaw()))).not.toThrow()
  })
})
