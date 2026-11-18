/**
 * Saasu credit notes are sale invoices of InvoiceType "Adjustment Note".
 * Fixtures follow the documented InvoiceTransactionSummary (GET Invoices) and
 * InvoiceTransactionDetail (GET Invoice/{id}) samples at
 * https://api.saasu.com/Help/Api/GET-Invoices and
 * https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs, with the type
 * set to "Adjustment Note" and the line signs negative as Saasu's help has
 * the user enter them (https://www.saasu.com/help/adjustment-note/).
 */
import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  isSaleAdjustmentNote,
  transformCreditMemo,
  type SaasuInvoiceDetail,
  type SaasuInvoiceSummary,
} from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/creditmemo'

function summary(overrides: Partial<SaasuInvoiceSummary> = {}): SaasuInvoiceSummary {
  return {
    TransactionId: 5093684,
    LastUpdatedId: 'AAAAAAAKgc=',
    Currency: 'AUD',
    InvoiceNumber: 'INV-1123',
    InvoiceType: 'Adjustment Note',
    TransactionType: 'S',
    Layout: 'I',
    BrandId: null,
    Summary: 'Refund for order 1123',
    TotalAmount: -10.45,
    TotalTaxAmount: -0.95,
    IsTaxInc: true,
    AmountPaid: 0.0,
    AmountOwed: -10.45,
    FxRate: 1.0,
    AutoPopulateFxRate: false,
    RequiresFollowUp: false,
    SentToContact: true,
    TransactionDate: '2015-01-24T00:00:00',
    BillingContactId: 1568986,
    BillingContactFirstName: 'Freddy',
    BillingContactLastName: 'Fungus',
    BillingContactOrganisationName: 'Fungal Innovation',
    ShippingContactId: 10,
    CreatedDateUtc: '2026-09-27T19:00:11.2424032Z',
    LastModifiedDateUtc: '2026-09-28T19:00:11.2424032Z',
    PaymentStatus: 'U',
    DueDate: null,
    InvoiceStatus: 'I',
    PurchaseOrderNumber: 'PO-4456',
    PaymentCount: 0,
    Tags: ['Note'],
    _links: [],
    ...overrides,
  }
}

function detail(overrides: Partial<SaasuInvoiceDetail> = {}): SaasuInvoiceDetail {
  return {
    ...summary(),
    LineItems: [
      {
        Id: 30,
        Description: 'Sale Item',
        AccountId: null,
        TaxCode: 'G1',
        TotalAmount: -10.45,
        Quantity: -3.0,
        UnitPrice: 11.5,
        PercentageDiscount: 0.0,
        InventoryId: 30,
        ItemCode: 'CC123',
        Location: null,
        Tags: [],
        Attributes: [],
        _links: [],
      },
    ],
    NotesInternal: null,
    NotesExternal: 'Goods returned damaged',
    ...overrides,
  }
}

describe('isSaleAdjustmentNote (saasu)', () => {
  it('is true only for a sale whose InvoiceType is Adjustment Note', () => {
    expect(isSaleAdjustmentNote(summary())).toBe(true)
    expect(isSaleAdjustmentNote(summary({ InvoiceType: 'Tax Invoice' }))).toBe(false)
    expect(isSaleAdjustmentNote(summary({ TransactionType: 'P' }))).toBe(false)
    expect(isSaleAdjustmentNote(summary({ InvoiceType: 'adjustment note' }))).toBe(false)
  })
})

describe('transformCreditMemo (saasu)', () => {
  it('maps a summary row, amounts as positive minor units', () => {
    const cm = CreditMemoSchema.parse(transformCreditMemo(summary()))
    expect(cm).toMatchObject({
      id: '5093684',
      status: 'AUTHORIZED',
      creditmemoNumber: 'INV-1123',
      contactId: '1568986',
      currency: 'AUD',
      totalAmount: 1045,
      taxAmount: 95,
      paidAmount: 0,
      balanceAmount: 1045,
      lineAmountsIncludeTax: true,
      postedAt: '2015-01-24',
    })
    expect(cm.createdAt).toEqual(new Date('2026-09-27T19:00:11.242Z'))
    expect(cm.updatedAt).toEqual(new Date('2026-09-28T19:00:11.242Z'))
    expect(cm.lineItems).toBeUndefined()
    expect(cm.dueAt).toBeUndefined()
  })

  it('reports the magnitude whichever sign Saasu stores', () => {
    const cm = CreditMemoSchema.parse(
      transformCreditMemo(summary({ TotalAmount: 10.45, TotalTaxAmount: 0.95, AmountOwed: 10.45 })),
    )
    expect(cm.totalAmount).toBe(1045)
    expect(cm.taxAmount).toBe(95)
    expect(cm.balanceAmount).toBe(1045)
  })

  it('scales by the currency exponent', () => {
    const cm = CreditMemoSchema.parse(
      transformCreditMemo(summary({ Currency: 'JPY', TotalAmount: -1000 })),
    )
    expect(cm.totalAmount).toBe(1000)
  })

  it.each([
    ['P', 'PAID'],
    ['U', 'AUTHORIZED'],
    ['X', 'unknown'],
  ] as const)('maps PaymentStatus %s to %s', (raw, status) => {
    expect(
      CreditMemoSchema.parse(transformCreditMemo(summary({ PaymentStatus: raw }))).status,
    ).toBe(status)
  })

  it('leaves status absent when PaymentStatus is absent', () => {
    expect(
      CreditMemoSchema.parse(transformCreditMemo(summary({ PaymentStatus: null }))).status,
    ).toBeUndefined()
  })

  it('maps the detail record with its line items and user notes', () => {
    const cm = CreditMemoSchema.parse(transformCreditMemo(detail()))
    expect(cm.notes).toBe('Goods returned damaged')
    expect(cm.lineItems).toEqual([
      {
        id: '30',
        accountId: undefined,
        itemId: '30',
        itemSku: 'CC123',
        itemDescription: 'Sale Item',
        unitAmount: 1150,
        unitQuantity: 3,
        totalAmount: 1045,
      },
    ])
  })

  it('keeps a line of the opposite sign opposite, so the lines still sum to the header', () => {
    // A returns note of -100 with a +10 restocking fee: header -90.
    const raw = detail({
      TotalAmount: -90,
      TotalTaxAmount: null,
      AmountOwed: -90,
      LineItems: [
        { Id: 1, Description: 'Returned goods', TotalAmount: -100, Quantity: -1, UnitPrice: 100 },
        { Id: 2, Description: 'Restocking fee', TotalAmount: 10, Quantity: 1, UnitPrice: 10 },
      ],
    })
    const cm = CreditMemoSchema.parse(transformCreditMemo(raw))
    expect(cm.totalAmount).toBe(9000)
    expect(cm.lineItems!.map((l) => [l.unitAmount, l.unitQuantity, l.totalAmount])).toEqual([
      [10000, 1, 10000],
      [-1000, 1, -1000],
    ])
    expect(cm.lineItems!.reduce((s, l) => s + (l.totalAmount ?? 0), 0)).toBe(cm.totalAmount)
  })

  it('takes the note sign from the lines when the header total is absent', () => {
    const raw = detail({
      TotalAmount: null,
      LineItems: [
        { Id: 1, TotalAmount: -100, Quantity: -1, UnitPrice: 100 },
        { Id: 2, TotalAmount: 10, Quantity: 1, UnitPrice: 10 },
      ],
    })
    const cm = CreditMemoSchema.parse(transformCreditMemo(raw))
    expect(cm.lineItems!.map((l) => l.totalAmount)).toEqual([10000, -1000])
  })

  it('reads a positively stored note the same way', () => {
    const raw = detail({
      TotalAmount: 90,
      LineItems: [
        { Id: 1, TotalAmount: 100, Quantity: 1, UnitPrice: 100 },
        { Id: 2, TotalAmount: -10, Quantity: 1, UnitPrice: -10 },
      ],
    })
    const cm = CreditMemoSchema.parse(transformCreditMemo(raw))
    expect(cm.lineItems!.map((l) => [l.unitAmount, l.totalAmount])).toEqual([
      [10000, 10000],
      [-1000, -1000],
    ])
  })

  it('leaves out a fractional quantity rather than rounding it', () => {
    const raw = detail()
    raw.LineItems![0]!.Quantity = -1.5
    const cm = CreditMemoSchema.parse(transformCreditMemo(raw))
    expect(cm.lineItems![0]!.unitQuantity).toBeUndefined()
  })

  it('never invents an appliedTo link: Saasu documents none', () => {
    expect(CreditMemoSchema.parse(transformCreditMemo(detail())).appliedTo).toBeUndefined()
  })

  it('keeps the raw record as metadata', () => {
    const raw = summary()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })
})
