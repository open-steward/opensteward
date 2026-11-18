/**
 * Every canonical accounting amount is integer minor units — `Amount` is
 * `z.number().int()` and documents "minor units (e.g. cents)"
 * (packages/shared/src/schemas/limits.ts). Fortnox speaks decimal major units
 * (SEK with öre), and none of its transforms converted: they passed the
 * platform value straight through.
 *
 * Nothing validates adapter output at runtime — the canonical schemas drive
 * OpenAPI and tests, not ingestion — so this never threw. It silently stored
 * amounts 100x under contract, and stored fractional values where the contract
 * promises an integer. It affected the resources Fortnox was already syncing
 * (invoices, bills, accounts, journals), not only the newly wired ones.
 *
 * The write direction matters just as much: converting on read without
 * converting on write would post an invoice to Fortnox for 100x its value.
 *
 * The per-transform test files assert the mapping; this file pins the unit.
 */
import { describe, it, expect } from 'vitest'
import { transformAccount } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/account'
import { transformBill } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/bill'
import {
  transformCreditMemo,
  untransformCreditMemo,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/creditmemo'
import {
  transformExpense,
  untransformExpense,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/expense'
import {
  transformInvoice,
  untransformInvoice,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/invoice'
import {
  transformJournal,
  untransformJournal,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/journal'
import {
  transformOrder,
  untransformOrder,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/order'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/purchaseorder'
import {
  transformSalesOrder,
  untransformSalesOrder,
} from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/salesorder'
import { transformTransaction } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/transaction'
import { transformTaxRate } from '../../../../../../src/verticals/accounting/adapters/fortnox/transform/taxrate'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('read path: Fortnox decimal SEK becomes integer minor units', () => {
  it('account balance', () => {
    const row = transformAccount({ Number: 1930, Active: true, BalanceBroughtForward: 1234.5 } as any)
    expect(row.balance).toBe(123450)
  })

  it('bill totals', () => {
    const row = transformBill({ Total: 1250.5, VAT: 312.25, Balance: 100.75 } as any)
    expect(row.totalAmount).toBe(125050)
    expect(row.taxAmount).toBe(31225)
    expect(row.balanceAmount).toBe(10075)
  })

  it('invoice document and line amounts', () => {
    const row = transformInvoice({
      DocumentNumber: '1',
      Total: 1250.5,
      TotalVAT: 312.25,
      Balance: 100.75,
      PaidAmount: 50.25,
      InvoiceRows: [{ RowId: 1, Price: 250.5, OrderedQuantity: 5, Total: 1252.5, VAT: 313.13, Discount: 10.5 }],
    } as any)
    expect(row.totalAmount).toBe(125050)
    expect(row.taxAmount).toBe(31225)
    expect(row.balanceAmount).toBe(10075)
    expect(row.paidAmount).toBe(5025)
    expect(row.lineItems![0]!.unitAmount).toBe(25050)
    expect(row.lineItems![0]!.totalAmount).toBe(125250)
    expect(row.lineItems![0]!.taxAmount).toBe(31313)
    expect(row.lineItems![0]!.discountAmount).toBe(1050)
    // Canonical Amount is z.number().int(); a value left in major units with
    // öre would fail here rather than silently storing 100x under contract.
    expect(() => InvoiceSchema.parse(row)).not.toThrow()
  })

  it('credit memo document and line amounts', () => {
    const row = transformCreditMemo({
      DocumentNumber: '1',
      Total: 1250.5,
      TotalVAT: 312.25,
      Balance: 100.75,
      PaidAmount: 50.25,
      InvoiceRows: [{ RowId: 1, Price: 250.5, OrderedQuantity: 5, Total: 1252.5, VAT: 313.13, Discount: 10.5 }],
    } as any)
    expect(row.totalAmount).toBe(125050)
    expect(row.taxAmount).toBe(31225)
    expect(row.balanceAmount).toBe(10075)
    expect(row.paidAmount).toBe(5025)
    expect(row.lineItems![0]!.unitAmount).toBe(25050)
  })

  it('expense document and line amounts', () => {
    const row = transformExpense({
      DocumentNumber: 'E1',
      Total: 1250.5,
      VAT: 312.25,
      ExpenseRows: [{ RowId: 1, Total: 1250.5, VAT: 312.25 }],
    } as any)
    expect(row.totalAmount).toBe(125050)
    expect(row.taxAmount).toBe(31225)
    expect(row.lineItems![0]!.totalAmount).toBe(125050)
    expect(row.lineItems![0]!.taxAmount).toBe(31225)
  })

  it('journal debit and credit', () => {
    const row = transformJournal({
      VoucherNumber: 1,
      VoucherSeries: 'A',
      VoucherRows: [{ Account: 1930, Debit: 1250.5, Credit: 0 }, { Account: 3001, Debit: 0, Credit: 1250.5 }],
    } as any)
    expect(row.lineItems![0]!.debitAmount).toBe(125050)
    expect(row.lineItems![1]!.creditAmount).toBe(125050)
  })

  it('order document and line amounts', () => {
    const row = transformOrder({
      DocumentNumber: '1',
      Total: 1250.5,
      Status: 'invoiced',
      OrderRows: [{ RowId: 1, Price: 250.5, OrderedQuantity: 5, Total: 1252.5, VAT: 313.13, Discount: 10.5 }],
    } as any)
    expect(row.totalAmount).toBe(125050)
    expect(row.lineItems![0]!.unitAmount).toBe(25050)
    expect(row.lineItems![0]!.taxAmount).toBe(31313)
  })

  it('sales order document and line amounts', () => {
    const row = transformSalesOrder({
      DocumentNumber: '1',
      Total: 1250.5,
      Status: 'invoiced',
      OrderRows: [{ RowId: 1, Price: 250.5, OrderedQuantity: 5, Total: 1252.5, VAT: 313.13, Discount: 10.5 }],
    } as any)
    expect(row.totalAmount).toBe(125050)
    expect(row.lineItems![0]!.unitAmount).toBe(25050)
  })

  it('purchase order document and line amounts', () => {
    const row = transformPurchaseOrder({
      DocumentNumber: 'PO1',
      TotalWithVAT: 1250.5,
      Status: 'received',
      PurchaseOrderRows: [{ RowId: 1, Price: 250.5, OrderedQuantity: 5, Total: 1252.5 }],
    } as any)
    expect(row.totalAmount).toBe(125050)
    expect(row.lineItems![0]!.unitAmount).toBe(25050)
    expect(row.lineItems![0]!.totalAmount).toBe(125250)
  })

  it('transaction amount and write-offs', () => {
    const row = transformTransaction({
      Number: 'P1',
      Amount: 1250.5,
      AccountNumber: '1930',
      Source: 'bank',
      WriteOffs: [{ WriteOffAmount: 0.25, AccountNumber: '3740', Description: 'Öresavrundning' }],
    } as any)
    expect(row.totalAmount).toBe(125050)
    expect(row.lineItems![0]!.totalAmount).toBe(125050)
    expect(row.lineItems![1]!.totalAmount).toBe(25)
  })

  it('leaves a VAT percentage alone — a rate is not money', () => {
    const row = transformTaxRate({ Code: 'MP1', Description: 'Moms 25%', VATPercent: 25, Active: true })
    expect(row.rate).toBe(25)
  })
})

describe('write path: canonical minor units become decimal SEK for Fortnox', () => {
  it('invoice line price', () => {
    const body = untransformInvoice({ lineItems: [{ unitAmount: 25050, unitQuantity: 5 }] }) as any
    expect(body.InvoiceRows[0].Price).toBe(250.5)
  })

  it('credit memo line price', () => {
    const body = untransformCreditMemo({ lineItems: [{ unitAmount: 25050, unitQuantity: 5 }] }) as any
    expect(body.InvoiceRows[0].Price).toBe(250.5)
  })

  it('expense line total', () => {
    const body = untransformExpense({ lineItems: [{ totalAmount: 125050 }] }) as any
    expect(body.ExpenseRows[0].Total).toBe(1250.5)
  })

  it('journal debit and credit', () => {
    const body = untransformJournal({
      lineItems: [{ accountId: '1930', debitAmount: 125050, creditAmount: 0 }],
    }) as any
    expect(body.VoucherRows[0].Debit).toBe(1250.5)
  })

  it('order line price', () => {
    const body = untransformOrder({ lineItems: [{ unitAmount: 25050, unitQuantity: 5 }] }) as any
    expect(body.OrderRows[0].Price).toBe(250.5)
  })

  it('sales order line price', () => {
    const body = untransformSalesOrder({ lineItems: [{ unitAmount: 25050, unitQuantity: 5 }] }) as any
    expect(body.OrderRows[0].Price).toBe(250.5)
  })

  it('purchase order line price', () => {
    const body = untransformPurchaseOrder({ lineItems: [{ unitAmount: 25050, unitQuantity: 5 }] }) as any
    expect(body.PurchaseOrderRows[0].Price).toBe(250.5)
  })
})
