import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type InvoiceNinjaCredit,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditMemo(overrides: Partial<InvoiceNinjaCredit> = {}): InvoiceNinjaCredit {
  return {
    id: 'credit-1',
    status_id: 2,
    number: 'CM-001',
    client_id: 'client-42',
    amount: 5000,
    balance: 5000,
    paid_to_date: 0,
    tax_amount: 500,
    discount: 100,
    currency_id: '1', // USD
    date: '2024-03-01',
    due_date: '2024-04-01',
    public_notes: 'Credit for returned goods',
    line_items: [
      {
        product_key: 'WIDGET',
        notes: 'Widget return',
        cost: 50,
        quantity: 10,
        discount: 10,
        line_total: 490,
      },
    ],
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('credit-1')
  })

  it('maps status_id=1 to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status_id: 1 })).status).toBe('DRAFT')
  })

  it('maps status_id=2 to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status_id: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps status_id=3 to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status_id: 3 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status_id=4 to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status_id: 4 })).status).toBe('PAID')
  })

  it('defaults to DRAFT for null status_id', () => {
    expect(transformCreditMemo(makeCreditMemo({ status_id: null })).status).toBe('DRAFT')
  })

  it('maps creditmemoNumber from number', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-001')
  })

  it('maps contactId from client_id', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('client-42')
  })

  it('maps currency_id=1 to USD', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('maps totalAmount, taxAmount, discountAmount', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(500)
    expect(result.discountAmount).toBe(100)
  })

  it('maps balanceAmount from balance', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(5000)
  })

  it('maps notes from public_notes', () => {
    expect(transformCreditMemo(makeCreditMemo()).notes).toBe('Credit for returned goods')
  })

  it('maps line items', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('WIDGET')
    expect(li.itemDescription).toBe('Widget return')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(490)
  })

  it('returns empty lineItems array when line_items is null', () => {
    const result = transformCreditMemo(makeCreditMemo({ line_items: null }))
    expect(result.lineItems).toEqual([])
  })

  it('maps postedAt from date string', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps dueAt from due_date string', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps createdAt from epoch (×1000)', () => {
    expect(transformCreditMemo(makeCreditMemo()).createdAt).toEqual(new Date(1700000000 * 1000))
  })

  it('maps updatedAt from epoch (×1000)', () => {
    expect(transformCreditMemo(makeCreditMemo()).updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('passes CreditMemoSchema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo()))).not.toThrow()
  })
})
