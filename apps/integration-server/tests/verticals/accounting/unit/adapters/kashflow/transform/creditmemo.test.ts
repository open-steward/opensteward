import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  isCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/creditmemo'
import type { KashflowInvoice } from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/invoice'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

// KashFlow credit memos are negative-total invoices returned from the /invoices endpoint.
function makeCreditMemo(overrides: Partial<KashflowInvoice> = {}): KashflowInvoice {
  return {
    Number: 300,
    Id: 3001,
    CustomerCode: 'CUST001',
    GrossAmount: -100,
    NetAmount: -80,
    VATAmount: -20,
    TotalPaidAmount: 0,
    Status: 'Unpaid',
    Currency: { Code: 'GBP' },
    LineItems: [],
    Permalink: 'https://kashflow.example/cm/300',
    IssuedDate: '2024-03-01',
    DueDate: '2024-04-01',
    ...overrides,
  }
}

describe('isCreditNote', () => {
  it('returns true when GrossAmount is negative', () => {
    expect(isCreditNote(makeCreditMemo({ GrossAmount: -100 }))).toBe(true)
  })

  it('returns false when GrossAmount is positive', () => {
    expect(isCreditNote(makeCreditMemo({ GrossAmount: 100 }))).toBe(false)
  })

  it('falls back to NetAmount when GrossAmount is absent', () => {
    expect(isCreditNote(makeCreditMemo({ GrossAmount: undefined, NetAmount: -50 }))).toBe(true)
    expect(isCreditNote(makeCreditMemo({ GrossAmount: undefined, NetAmount: 50 }))).toBe(false)
  })

  it('returns false when GrossAmount is exactly 0 and NetAmount is negative', () => {
    expect(isCreditNote(makeCreditMemo({ GrossAmount: 0, NetAmount: -50 }))).toBe(true)
  })
})

describe('transformCreditMemo', () => {
  it('maps Number to id when present', () => {
    expect(transformCreditMemo(makeCreditMemo({ Number: 300 })).id).toBe('300')
  })

  it('falls back to String(Id) when Number is absent', () => {
    expect(transformCreditMemo(makeCreditMemo({ Number: undefined, Id: 3001 })).id).toBe('3001')
  })

  it('maps Number to creditmemoNumber when present', () => {
    expect(transformCreditMemo(makeCreditMemo({ Number: 300 })).creditmemoNumber).toBe('300')
  })

  it('leaves creditmemoNumber undefined when Number is absent', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ Number: undefined })).creditmemoNumber,
    ).toBeUndefined()
  })

  it('maps CustomerCode to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo({ CustomerCode: 'CUST001' })).contactId).toBe(
      'CUST001',
    )
  })

  it('maps Currency.Code to currency', () => {
    expect(transformCreditMemo(makeCreditMemo({ Currency: { Code: 'GBP' } })).currency).toBe('GBP')
  })

  it('converts negative GrossAmount to positive minor units (absolute value)', () => {
    expect(transformCreditMemo(makeCreditMemo({ GrossAmount: -100 })).totalAmount).toBe(10000)
  })

  it('converts negative VATAmount to positive minor units (absolute value)', () => {
    expect(transformCreditMemo(makeCreditMemo({ VATAmount: -20 })).taxAmount).toBe(2000)
  })

  it('converts negative TotalPaidAmount to positive minor units', () => {
    const result = transformCreditMemo(makeCreditMemo({ GrossAmount: -100, TotalPaidAmount: -40 }))
    expect(result.paidAmount).toBe(4000)
  })

  it('computes balanceAmount as abs(totalAmount) - abs(paidAmount)', () => {
    const result = transformCreditMemo(makeCreditMemo({ GrossAmount: -100, TotalPaidAmount: -40 }))
    expect(result.balanceAmount).toBe(6000)
  })

  it('maps Permalink to url', () => {
    const result = transformCreditMemo(
      makeCreditMemo({ Permalink: 'https://kashflow.example/cm/300' }),
    )
    expect(result.url).toBe('https://kashflow.example/cm/300')
  })

  it('maps status PAID when Status is "paid"', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PAID when Status is "overpaid"', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'overpaid' })).status).toBe('PAID')
  })

  it('maps status AUTHORIZED when Status is "overdue"', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'overdue' })).status).toBe('AUTHORIZED')
  })

  it('maps status AUTHORIZED when Status is "unpaid"', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Unpaid' })).status).toBe('AUTHORIZED')
  })

  it('maps status DRAFT for unrecognised status', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'NA' })).status).toBe('DRAFT')
  })

  it('maps line items — rate and quantity use absolute values', () => {
    const result = transformCreditMemo(
      makeCreditMemo({
        LineItems: [
          {
            Number: 1,
            Description: 'Returned widget',
            Quantity: -2,
            Rate: -50,
            VATAmount: -10,
            NominalCode: 4000,
            ProductCode: 'WDG-01',
            ProductName: 'Widget Pro',
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('4000')
    expect(li.itemId).toBe('WDG-01')
    expect(li.itemName).toBe('Widget Pro')
    expect(li.itemDescription).toBe('Returned widget')
    // abs(-50) * 100 = 5000
    expect(li.unitAmount).toBe(5000)
    // abs(-2) = 2
    expect(li.unitQuantity).toBe(2)
    // abs(-10) * 100 = 1000
    expect(li.taxAmount).toBe(1000)
    // abs(-50 * -2 + -10) * 100 = abs(90) * 100 = 9000
    expect(li.totalAmount).toBe(9000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces output that passes CreditMemoSchema validation', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
