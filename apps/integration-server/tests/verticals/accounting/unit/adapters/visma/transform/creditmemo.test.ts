import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type VismaCreditInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/visma/transform/creditmemo'

function makeCreditInvoice(
  overrides: Partial<VismaCreditInvoice> = {},
): VismaCreditInvoice {
  return {
    Id: 'credit-uuid-1234',
    CustomerId: 'cust-uuid-5678',
    CustomerNumber: 'C001',
    InvoiceDate: '2024-06-01',
    DueDate: '2024-07-01',
    TotalAmount: -5000,
    TotalVatAmount: -1000,
    RemainingAmount: -5000,
    InvoiceCurrencyCode: 'SEK',
    IsCreditInvoice: true,
    InvoiceNumber: 10042,
    YourReference: 'CR Ref',
    OurReference: 'Internal',
    Rows: [
      {
        LineNumber: 1,
        ArticleId: 'art-uuid-001',
        ArticleNumber: 'ART-001',
        Text: 'Credit for Widget A',
        UnitPrice: -500,
        Quantity: 10,
        DiscountPercentage: 0,
        TotalAmount: -5000,
        TotalVatAmount: -1000,
      },
    ],
    CreatedUtc: '2024-06-01T08:00:00Z',
    ModifiedUtc: '2024-06-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields', () => {
    const result = transformCreditMemo(makeCreditInvoice())
    expect(result.id).toBe('credit-uuid-1234')
    expect(result.contactId).toBe('cust-uuid-5678')
    expect(result.currency).toBe('SEK')
    expect(result.totalAmount).toBe(-5000)
    expect(result.taxAmount).toBe(-1000)
    expect(result.creditmemoNumber).toBe('10042')
  })

  it('maps status: authorized (has invoice number, full balance remaining)', () => {
    expect(transformCreditMemo(makeCreditInvoice()).status).toBe('AUTHORIZED')
  })

  it('maps status: paid (remaining amount is 0)', () => {
    const result = transformCreditMemo(
      makeCreditInvoice({ RemainingAmount: 0 }),
    )
    expect(result.status).toBe('PAID')
  })

  it('maps status: partially paid', () => {
    const result = transformCreditMemo(
      makeCreditInvoice({ RemainingAmount: -2000 }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps status: draft (no invoice number)', () => {
    const result = transformCreditMemo(
      makeCreditInvoice({ InvoiceNumber: 0, RemainingAmount: -5000 }),
    )
    expect(result.status).toBe('DRAFT')
  })

  it('parses dates', () => {
    const result = transformCreditMemo(makeCreditInvoice())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
    expect(result.dueAt).toEqual(new Date('2024-07-01'))
    expect(result.createdAt).toEqual(new Date('2024-06-01T08:00:00Z'))
  })

  it('maps lineItems', () => {
    const result = transformCreditMemo(makeCreditInvoice())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('art-uuid-001')
    expect(li.itemDescription).toBe('Credit for Widget A')
    expect(li.unitAmount).toBe(-500)
    expect(li.totalAmount).toBe(-5000)
  })

  it('passes raw object through as metadata', () => {
    const raw = makeCreditInvoice()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditInvoice())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
