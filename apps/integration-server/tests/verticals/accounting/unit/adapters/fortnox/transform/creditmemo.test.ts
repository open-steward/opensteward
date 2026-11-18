import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type FortnoxCreditInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/creditmemo'

function makeCreditMemo(overrides: Partial<FortnoxCreditInvoice> = {}): FortnoxCreditInvoice {
  return {
    DocumentNumber: 'CM-42',
    CustomerNumber: '1',
    CustomerName: 'Acme AB',
    InvoiceDate: '2024-03-01',
    DueDate: '2024-03-31',
    Total: -10000,
    TotalVAT: -2000,
    Balance: -10000,
    Currency: 'SEK',
    Booked: false,
    Cancelled: false,
    PaidAmount: 0,
    InvoiceRows: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps DocumentNumber to id and creditmemoNumber', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('CM-42')
    expect(result.creditmemoNumber).toBe('CM-42')
  })

  it('maps CustomerNumber to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('cust_1')
  })

  it('maps Total to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(-1000000)
  })

  it('maps TotalVAT to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(-200000)
  })

  it('maps Currency to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('SEK')
  })

  it('maps status DRAFT when not booked and not cancelled', () => {
    expect(transformCreditMemo(makeCreditMemo({ Booked: false, Cancelled: false })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when booked with outstanding balance', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ Booked: true, Cancelled: false, Balance: -10000, Total: -10000 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when booked and balance is zero', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ Booked: true, Cancelled: false, Balance: 0 })).status,
    ).toBe('PAID')
  })

  it('maps status VOIDED when cancelled', () => {
    expect(transformCreditMemo(makeCreditMemo({ Cancelled: true })).status).toBe('VOIDED')
  })

  it('maps InvoiceDate to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps DueDate to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
  })

  it('maps InvoiceRows to lineItems', () => {
    const raw = makeCreditMemo({
      InvoiceRows: [
        {
          RowId: 1,
          ArticleNumber: 'ART01',
          Description: 'Widget',
          Price: -100,
          OrderedQuantity: 10,
          Total: -1000,
          VAT: -200,
          AccountNumber: '3000',
          Discount: 0,
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].itemId).toBe('ART01')
    expect(result.lineItems![0].totalAmount).toBe(-100000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
