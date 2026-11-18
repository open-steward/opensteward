/**
 * QuickFile credit note → CreditMemo. A credit note is a negative-value
 * INVOICE (https://community.quickfile.co.uk/t/creating-a-credit-note-using-the-api/23204);
 * fixtures follow the vendor's Invoice_Search and Invoice_Get JSON samples
 * (https://api.quickfile.co.uk/GetJsonSample/Invoice_Search/1_2, …/Invoice_Get/1_2)
 * with the values negated.
 */
import { describe, it, expect } from 'vitest'
import {
  isCreditNote,
  transformCreditMemo,
  type QuickFileInvoiceDetails,
  type QuickFileInvoiceSearchRecord,
} from '../../../../../../../src/verticals/accounting/adapters/quickfile/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function searchRow(
  overrides: Partial<QuickFileInvoiceSearchRecord> = {},
): QuickFileInvoiceSearchRecord {
  return {
    IssueDate: '2017-06-03',
    InvoiceID: 7718954,
    ClientID: 326723,
    ClientCompanyName: 'Acme Printing',
    ClientContactName: 'John Smith',
    InvoiceNumber: '000054',
    Description: 'Task Line 1',
    Currency: 'GBP',
    Amount: -13.2,
    NetAmount: -11.0,
    VatAmount: -2.2,
    Status: 'SENT',
    ViewHref: 'https://www.quickfile.co.uk/Sales/ViewPlaceholder?q=######',
    ...overrides,
  }
}

function details(overrides: Partial<QuickFileInvoiceDetails> = {}): QuickFileInvoiceDetails {
  return {
    InvoiceID: 7741492,
    CreatedDate: '2017-06-07T00:00:00',
    InvoiceType: 'INVOICE',
    InvoiceNumber: '000057',
    IssueDate: '2017-06-07T00:00:00',
    ClientID: 1329095,
    Currency: 'GBP',
    TotalAmount: -384.0,
    Discount: 0.0,
    Notes: 'Returned goods',
    Status: 'SENT',
    ItemLines: {
      Item: [
        {
          ItemLineID: 12993206,
          ItemID: 0,
          ItemName: null,
          ItemDescription: 'Test Item 1',
          NominalCode: '4000',
          TaxName1: 'VAT',
          TaxPercentage1: 20.0,
          UnitCost: -100.0,
          Qty: 1.0,
          LineTotal: -100.0,
        },
        {
          ItemLineID: 12994954,
          ItemID: 55,
          ItemDescription: 'Restocking fee',
          NominalCode: '4000',
          UnitCost: 20.0,
          Qty: 1.0,
          LineTotal: 20.0,
        },
      ],
    },
    TaskLines: {
      Task: [
        {
          ItemLineID: 12994953,
          ItemDescription: 'Task line 1',
          NominalCode: '4000',
          UnitCost: -150.0,
          Qty: 2.0,
          LineTotal: -300.0,
        },
      ],
    },
    ...overrides,
  }
}

describe('isCreditNote', () => {
  it('is true for a negative-value invoice search row', () => {
    expect(isCreditNote(searchRow())).toBe(true)
  })

  it('is false for a positive or zero invoice', () => {
    expect(isCreditNote(searchRow({ Amount: 13.2 }))).toBe(false)
    expect(isCreditNote(searchRow({ Amount: 0 }))).toBe(false)
  })

  it('reads a numeric-string amount', () => {
    expect(isCreditNote(searchRow({ Amount: '-1.00' }))).toBe(true)
  })

  it('is false when the amount is absent', () => {
    expect(isCreditNote(searchRow({ Amount: undefined }))).toBe(false)
  })

  it('reads TotalAmount on an Invoice_Get detail', () => {
    expect(isCreditNote(details())).toBe(true)
    expect(isCreditNote(details({ TotalAmount: 384 }))).toBe(false)
  })

  it('never treats an estimate or recurring profile as a credit note', () => {
    expect(isCreditNote(details({ InvoiceType: 'ESTIMATE' }))).toBe(false)
    expect(isCreditNote(details({ InvoiceType: 'RECURRING' }))).toBe(false)
  })
})

describe('transformCreditMemo (Invoice_Search row)', () => {
  it('maps the documented fields and passes CreditMemoSchema', () => {
    const cm = CreditMemoSchema.parse(transformCreditMemo(searchRow()))
    expect(cm).toMatchObject({
      id: '7718954',
      creditmemoNumber: '000054',
      contactId: 'cust_326723',
      currency: 'GBP',
      status: 'AUTHORIZED',
      totalAmount: 1320,
      taxAmount: 220,
      postedAt: '2017-06-03',
    })
    expect(cm.lineItems).toBeNull()
    expect(cm.lineAmountsIncludeTax).toBeUndefined()
    expect(cm.appliedTo).toBeUndefined()
  })

  it('scales by the currency exponent', () => {
    const cm = CreditMemoSchema.parse(
      transformCreditMemo(searchRow({ Currency: 'JPY', Amount: -1500, VatAmount: -136 })),
    )
    expect(cm.totalAmount).toBe(1500)
    expect(cm.taxAmount).toBe(136)
  })

  it.each([
    ['DRAFT', 'DRAFT'],
    ['SENT', 'AUTHORIZED'],
    ['UNPAID', 'AUTHORIZED'],
    ['AGED', 'AUTHORIZED'],
    ['DISPUTED', 'AUTHORIZED'],
    ['PAIDPART', 'PARTIALLY_PAID'],
    ['PAIDFULL', 'PAID'],
    ['DELETED', 'DELETED'],
    ['PAUSED', 'unknown'],
  ])('maps Status %s to %s', (status, expected) => {
    const cm = CreditMemoSchema.parse(transformCreditMemo(searchRow({ Status: status })))
    expect(cm.status).toBe(expected)
  })

  it('leaves status out when absent', () => {
    const cm = CreditMemoSchema.parse(transformCreditMemo(searchRow({ Status: undefined })))
    expect(cm.status).toBeUndefined()
  })

  it('keeps the raw row as metadata', () => {
    const raw = searchRow()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })
})

describe('transformCreditMemo (Invoice_Get detail)', () => {
  it('reports header amounts as magnitudes and lines by the note sign', () => {
    const cm = CreditMemoSchema.parse(transformCreditMemo(details()))
    expect(cm.totalAmount).toBe(38400)
    expect(cm.notes).toBe('Returned goods')
    expect(cm.postedAt).toBe('2017-06-07')
    expect(cm.lineAmountsIncludeTax).toBe(false)
    expect(cm.lineItems).toEqual([
      {
        id: '12993206',
        itemDescription: 'Test Item 1',
        accountId: '4000',
        unitAmount: 10000,
        unitQuantity: 1,
        totalAmount: 10000,
      },
      {
        id: '12994954',
        itemId: '55',
        itemDescription: 'Restocking fee',
        accountId: '4000',
        unitAmount: -2000,
        unitQuantity: 1,
        totalAmount: -2000,
      },
      {
        id: '12994953',
        itemDescription: 'Task line 1',
        accountId: '4000',
        unitAmount: 15000,
        unitQuantity: 2,
        totalAmount: 30000,
      },
    ])
  })

  it('leaves out a fractional quantity instead of rounding it', () => {
    const cm = CreditMemoSchema.parse(
      transformCreditMemo(
        details({
          TaskLines: null,
          ItemLines: { Item: [{ ItemLineID: 1, UnitCost: -10, Qty: 1.5, LineTotal: -15 }] },
        }),
      ),
    )
    expect(cm.lineItems?.[0]?.unitQuantity).toBeUndefined()
    expect(cm.lineItems?.[0]?.totalAmount).toBe(1500)
  })

  it('passes CreditMemoSchema with only the id', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo({ InvoiceID: 1 }))).not.toThrow()
  })
})
