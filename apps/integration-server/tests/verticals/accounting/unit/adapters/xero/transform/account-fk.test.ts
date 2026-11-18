import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { transformInvoice, untransformInvoice, type XeroInvoice } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/invoice'
import { transformBill, type XeroBill } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/bill'
import { transformCreditMemo, type XeroCreditNote } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/creditmemo'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/order'
import { transformPurchaseOrder, type XeroPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/purchaseorder'
import { transformTransaction, type XeroBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/transaction'
import { transformExpense } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/expense'
import { transformAccount, type XeroAccount } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/account'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

/**
 * Finding 17 — a reference field must carry the value the target entity
 * exposes as `id`, in the same identifier space.
 *
 * Xero line items ship BOTH identifiers:
 *
 *     { "AccountCode": "200",
 *       "AccountID":   "d1ebb97b-d207-4ccb-9ab6-8a466a8b4d39" }
 *
 * and `transformAccount` emits the GUID as `id` with the code as
 * `customerDefinedCode`. Mapping `accountId` from `AccountCode` therefore
 * produced a reference that `get_accounts(id=…)` could never resolve. The
 * code is not a safe join key either — Xero does not guarantee it unique or
 * stable across an org — so it is exposed as its own field rather than
 * overloading `accountId`.
 *
 * This is the same defect class as Finding 1 (contact ids), which was fixed
 * for contacts alone. Every line-item-bearing Xero transform is covered here,
 * plus a source-level guard, so the class closes rather than the instance.
 */

const ACCOUNT_GUID = 'd1ebb97b-d207-4ccb-9ab6-8a466a8b4d39'
const ACCOUNT_CODE = '200'

const LINE_ITEM = {
  LineItemID: 'li-1',
  Description: 'Consulting',
  UnitAmount: 100,
  Quantity: 1,
  TaxAmount: 0,
  LineAmount: 100,
  AccountCode: ACCOUNT_CODE,
  AccountID: ACCOUNT_GUID,
  ItemCode: '',
}

const CONTACT = { ContactID: 'cid-1', Name: 'Acme Ltd' }
const D = '2026-09-01T00:00:00'

function account(): XeroAccount {
  return {
    AccountID: ACCOUNT_GUID, Code: ACCOUNT_CODE, Name: 'Sales', Type: 'REVENUE',
    Status: 'ACTIVE', Description: '', CurrencyCode: 'GBP', Class: 'REVENUE',
  } as XeroAccount
}

function invoiceDoc(): XeroInvoice {
  return {
    InvoiceID: 'inv-1', Type: 'ACCREC', Status: 'AUTHORISED', InvoiceNumber: 'INV-1',
    Reference: '', Contact: CONTACT, DateString: D, DueDateString: D, Total: 100,
    TotalTax: 0, AmountDue: 100, AmountPaid: 0, CurrencyCode: 'GBP',
    LineItems: [LINE_ITEM], Url: '',
  } as XeroInvoice
}

type AccountLine = { accountId?: string | null | undefined; accountCode?: string | null | undefined }

/**
 * Binds each document type to the schema that governs it.
 *
 * Generic in `T` on purpose: the eight canonical schemas are eight unrelated
 * Zod object types, and a single hand-written supertype cannot describe them
 * all — trying to made every entry unassignable. `T` is inferred per call, so
 * each case keeps its own type while the array stays homogeneous.
 */
function lineCase<T extends { lineItems?: AccountLine[] | null | undefined }>(
  name: string,
  schema: { parse: (v: unknown) => T },
  run: () => T,
): { name: string; lines: () => AccountLine[]; parsedLines: () => AccountLine[] } {
  return {
    name,
    lines: () => run().lineItems ?? [],
    parsedLines: () => schema.parse(run()).lineItems ?? [],
  }
}

const CASES = [
  lineCase('transformInvoice', InvoiceSchema, () => transformInvoice(invoiceDoc())),
  lineCase('transformBill', BillSchema, () => transformBill({
      InvoiceID: 'bill-1', InvoiceNumber: 'B-1', Reference: '', Contact: CONTACT,
      DateString: D, DueDateString: D, Total: 100, TotalTax: 0, AmountDue: 100,
      AmountPaid: 0, CurrencyCode: 'GBP', Status: 'AUTHORISED', LineItems: [LINE_ITEM],
    } as unknown as XeroBill )),
  lineCase('transformCreditMemo', CreditMemoSchema, () => transformCreditMemo({
      CreditNoteID: 'cn-1', CreditNoteNumber: 'CN-1', Contact: CONTACT, DateString: D,
      DueDateString: D, Total: 100, TotalTax: 0, AppliedAmount: 0, RemainingCredit: 100,
      CurrencyCode: 'GBP', Status: 'AUTHORISED', Type: 'ACCRECCREDIT', LineItems: [LINE_ITEM],
    } as unknown as XeroCreditNote )),
  lineCase('transformOrder', OrderSchema, () => transformOrder({
      PurchaseOrderID: 'po-order-1', PurchaseOrderNumber: 'PO-ORDER-1', Contact: CONTACT,
      DateString: D, DeliveryDateString: D, CurrencyCode: 'GBP', Total: 100, TotalTax: 0,
      Status: 'AUTHORISED', LineItems: [LINE_ITEM], DeliveryAddress: '', AttentionTo: '',
    } as unknown as XeroPurchaseOrder )),
  lineCase('transformPurchaseOrder', PurchaseOrderSchema, () => transformPurchaseOrder({
      PurchaseOrderID: 'po-1', PurchaseOrderNumber: 'PO-1', Contact: CONTACT, DateString: D,
      DeliveryDateString: D, CurrencyCode: 'GBP', Total: 100, TotalTax: 0,
      Status: 'AUTHORISED', LineItems: [LINE_ITEM], DeliveryAddress: '', AttentionTo: '',
    } as unknown as XeroPurchaseOrder )),
  lineCase('transformTransaction', TransactionSchema, () => transformTransaction({
      BankTransactionID: 'bt-1', Type: 'RECEIVE', Contact: CONTACT,
      BankAccount: { AccountID: 'ba-1', Code: '090' }, DateString: D, Total: 100,
      TotalTax: 0, CurrencyCode: 'GBP', Reference: '', IsReconciled: true,
      Status: 'AUTHORISED', LineItems: [LINE_ITEM],
    } as unknown as XeroBankTransaction )),
  lineCase('transformExpense', ExpenseSchema, () => transformExpense({
      BankTransactionID: 'bt-2', Type: 'SPEND', Contact: CONTACT,
      BankAccount: { AccountID: 'ba-1', Code: '090' }, DateString: D, Total: 100,
      TotalTax: 0, CurrencyCode: 'GBP', Reference: '', IsReconciled: true,
      Status: 'AUTHORISED', LineItems: [LINE_ITEM],
    } as unknown as XeroBankTransaction )),
]

describe('Xero line-item accountId resolves against Account.id', () => {
  // The premise the rest of the file rests on: the two identifier spaces are
  // genuinely different, so mapping the wrong one is observable.
  // Spelled out rather than routed through `lineCase`, so the schema is named
  // at the call site. This is the assertion that would have caught
  // `accountCode` missing from `TransactionLineitemSchema`: the transform set
  // it, every pre-parse assertion passed, and `parse()` dropped it silently
  // because the schema is not strict.
  it('InvoiceSchema keeps both identifiers on the parsed document', () => {
    const parsed = InvoiceSchema.parse(transformInvoice(invoiceDoc()))
    expect(parsed.lineItems?.[0]?.accountId).toBe(ACCOUNT_GUID)
    expect(parsed.lineItems?.[0]?.accountCode).toBe(ACCOUNT_CODE)
  })

  it('transformAccount exposes the GUID as id and the code as customerDefinedCode', () => {
    const a = transformAccount(account())
    expect(a.id).toBe(ACCOUNT_GUID)
    expect(a.customerDefinedCode).toBe(ACCOUNT_CODE)
    expect(a.id).not.toBe(a.customerDefinedCode)
  })

  for (const c of CASES) {
    it(`${c.name} maps accountId to AccountID, not AccountCode`, () => {
      const lines = c.lines()
      expect(lines.length).toBeGreaterThan(0)
      for (const li of lines) {
        expect(li.accountId).toBe(ACCOUNT_GUID)
        expect(li.accountId).not.toBe(ACCOUNT_CODE)
      }
    })

    it(`${c.name} preserves the human-facing code as accountCode`, () => {
      for (const li of c.lines()) expect(li.accountCode).toBe(ACCOUNT_CODE)
    })

    it(`${c.name} keeps both identifiers through the canonical schema`, () => {
      // Asserting on the transform's return value alone missed exactly this:
      // `TransactionLineitemSchema` did not declare `accountCode`, and since
      // the schema is not strict, `parse()` dropped it on the way out while
      // every pre-parse assertion above kept passing.
      const parsed = c.parsedLines()
      expect(parsed.length).toBeGreaterThan(0)
      for (const li of parsed) {
        expect(li.accountId).toBe(ACCOUNT_GUID)
        expect(li.accountCode).toBe(ACCOUNT_CODE)
      }
    })
  }

  it('omits accountId rather than falling back to the code when AccountID is absent', () => {
    // A fallback would silently reintroduce the wrong identifier space on any
    // payload that predates AccountID — an unresolvable reference presented as
    // a resolvable one. Absent is honest; wrong is not.
    const { AccountID: _drop, ...noGuid } = LINE_ITEM
    const lines = transformInvoice({
      InvoiceID: 'inv-1', Type: 'ACCREC', Status: 'AUTHORISED', InvoiceNumber: 'INV-1',
      Reference: '', Contact: CONTACT, DateString: D, DueDateString: D, Total: 100,
      TotalTax: 0, AmountDue: 100, AmountPaid: 0, CurrencyCode: 'GBP',
      LineItems: [noGuid], Url: '',
    } as unknown as XeroInvoice).lineItems ?? []
    expect(lines[0]?.accountId).toBeUndefined()
    expect(lines[0]?.accountCode).toBe(ACCOUNT_CODE)
  })
})

describe('Xero invoice write path posts the identifier it was given', () => {
  it('sends accountId as AccountID and accountCode as AccountCode', () => {
    const body = untransformInvoice({
      lineItems: [{ accountId: ACCOUNT_GUID, accountCode: ACCOUNT_CODE, unitAmount: 10000, unitQuantity: 1 }],
    })
    const line = (body['LineItems'] as Array<Record<string, unknown>>)[0]
    expect(line?.['AccountID']).toBe(ACCOUNT_GUID)
    expect(line?.['AccountCode']).toBe(ACCOUNT_CODE)
  })

  it('never posts a GUID in the AccountCode field', () => {
    // The old write path did exactly this: `AccountCode: li.accountId`. Once
    // `accountId` became a GUID that would post a GUID as a chart-of-accounts
    // code, which Xero rejects — a read-side fix silently breaking writes.
    const body = untransformInvoice({ lineItems: [{ accountId: ACCOUNT_GUID }] })
    const line = (body['LineItems'] as Array<Record<string, unknown>>)[0]
    expect(line?.['AccountCode']).toBeUndefined()
    expect(line?.['AccountID']).toBe(ACCOUNT_GUID)
  })
})

describe('source guard — no Xero transform assigns a code into an id field', () => {
  const dir = join(__dirname, '../../../../../../../src/verticals/accounting/adapters/xero/transform')

  it('no transform maps AccountCode into accountId', () => {
    const offenders: string[] = []
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(dir, file), 'utf8')
      // Matches `accountId: <anything>.AccountCode`, the exact shape of the bug.
      if (/accountId:\s*[\w.?]*\.AccountCode\b/.test(src)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
