import { describe, it, expect, afterEach } from 'vitest'
import { transformInvoice, type XeroInvoice } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/invoice'
import { transformBill, type XeroBill } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/bill'
import { transformCreditMemo, type XeroCreditNote } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/creditmemo'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/order'
import { transformPurchaseOrder, type XeroPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/purchaseorder'
import { transformTransaction, type XeroBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/transaction'
import { transformExpense } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/expense'
import { transformJournal, type XeroJournal } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/journal'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

/**
 * Closes the class behind Finding 12 rather than one instance of it.
 *
 * Xero sends every calendar date as a ZONELESS DATE-TIME — `"2026-09-01T00:00:00"`,
 * not `"2026-09-01"`. ECMAScript reads the date-only form as UTC but the
 * date-time form as LOCAL, so `new Date(raw.DateString)` yielded a different
 * instant per deployment and, east of UTC, a different calendar DAY:
 *
 *     TZ=Europe/Stockholm  "2026-09-01T00:00:00"  ->  2026-08-31T22:00:00.000Z
 *
 * The pre-existing per-transform tests all used the date-only fixture form,
 * which is already UTC — which is exactly why none of them caught this. These
 * cases therefore use the real wire shape AND run under a non-UTC timezone.
 * Both halves are load-bearing: drop either and the test passes against the
 * broken `new Date()` it exists to forbid.
 *
 * `postedAt`/`dueAt` now ship as CALENDAR DATES rather than instants, because
 * Xero states a date and a UTC instant invents both a time and a zone. Fields
 * that genuinely are instants — `CreatedDateUTC`, a bank transaction's
 * `createdAt` — keep the timestamp form, and are asserted here too so the
 * distinction is pinned rather than assumed.
 */

const NON_UTC_TZ = 'Europe/Stockholm' // UTC+2 in September — shifts to the previous day
const DATE = '2026-09-01T00:00:00'
const DUE = '2026-10-01T00:00:00'
// `postedAt`/`dueAt` are calendar dates now (Finding 12): Xero states a date,
// so a date is what ships. The instant form remains for fields that genuinely
// are instants, such as `CreatedDateUTC`.
const EXPECTED_DATE = '2026-09-01'
const EXPECTED_DUE = '2026-10-01'
const EXPECTED_INSTANT = '2026-09-01T00:00:00.000Z'

const originalTz = process.env['TZ']
function useNonUtcTz(): void {
  process.env['TZ'] = NON_UTC_TZ
}
afterEach(() => {
  if (originalTz === undefined) delete process.env['TZ']
  else process.env['TZ'] = originalTz
})

// Guards the guard: if a future Node stops honouring a runtime TZ change,
// every case below would pass vacuously against the very bug it forbids.
it('the timezone override actually reaches Date parsing', () => {
  useNonUtcTz()
  expect(new Date(DATE).toISOString()).toBe('2026-08-31T22:00:00.000Z')
})

const CONTACT = { ContactID: 'cid-1', Name: 'Acme Ltd' }
const LINE_ITEMS: never[] = []

function invoice(): XeroInvoice {
  return {
    InvoiceID: 'inv-1', Type: 'ACCREC', Status: 'AUTHORISED', InvoiceNumber: 'INV-1',
    Reference: '', Contact: CONTACT, DateString: DATE, DueDateString: DUE,
    Total: 100, TotalTax: 0, AmountDue: 100, AmountPaid: 0, CurrencyCode: 'GBP',
    LineItems: LINE_ITEMS, Url: '',
  }
}

function bill(): XeroBill {
  return {
    InvoiceID: 'bill-1', InvoiceNumber: 'BILL-1', Reference: '', Contact: CONTACT,
    DateString: DATE, DueDateString: DUE, Total: 100, TotalTax: 0, AmountDue: 100,
    AmountPaid: 0, CurrencyCode: 'GBP', Status: 'AUTHORISED', LineItems: LINE_ITEMS,
  } as XeroBill
}

function creditNote(): XeroCreditNote {
  return {
    CreditNoteID: 'cn-1', CreditNoteNumber: 'CN-1', Contact: CONTACT,
    DateString: DATE, DueDateString: DUE, Total: 100, TotalTax: 0,
    AppliedAmount: 0, RemainingCredit: 100, CurrencyCode: 'GBP',
    Status: 'AUTHORISED', Type: 'ACCRECCREDIT', LineItems: LINE_ITEMS,
  } as XeroCreditNote
}

function purchaseOrder(): XeroPurchaseOrder {
  return {
    PurchaseOrderID: 'po-1', PurchaseOrderNumber: 'PO-1', Contact: CONTACT,
    DateString: DATE, DeliveryDateString: DUE, CurrencyCode: 'GBP', Total: 100,
    TotalTax: 0, Status: 'AUTHORISED', LineItems: LINE_ITEMS,
    DeliveryAddress: '', AttentionTo: '',
  } as XeroPurchaseOrder
}

function bankTransaction(): XeroBankTransaction {
  return {
    BankTransactionID: 'bt-1', Type: 'SPEND', Contact: CONTACT,
    BankAccount: { AccountID: 'ba-1', Code: '090' }, DateString: DATE,
    Total: 100, TotalTax: 0, CurrencyCode: 'GBP', Reference: '',
    IsReconciled: true, Status: 'AUTHORISED', LineItems: [],
  } as XeroBankTransaction
}

function journal(): XeroJournal {
  return {
    JournalID: 'j-1', JournalDate: DATE, JournalNumber: 1, Reference: '',
    // Xero's own UTC field carries no offset either, despite the name.
    CreatedDateUTC: DATE, JournalLines: [],
  }
}

describe('Xero date zoning — zoneless wire values are read as UTC', () => {
  it('transformInvoice keeps postedAt and dueAt on the stated calendar day', () => {
    useNonUtcTz()
    const r = transformInvoice(invoice())
    expect(r.postedAt).toBe(EXPECTED_DATE)
    expect(r.dueAt).toBe(EXPECTED_DUE)
    // The calendar-date arm has to survive the schema, not just the mapper.
    // `DateOrCalendarDate` accepts a `Date` OR a `YYYY-MM-DD` string, so a
    // regression that emitted a zoned instant here would still be a Date and
    // still parse — this pins that what comes out the far side is the string.
    const parsed = InvoiceSchema.parse(r)
    expect(parsed.postedAt).toBe(EXPECTED_DATE)
    expect(parsed.dueAt).toBe(EXPECTED_DUE)
  })

  it('transformBill keeps postedAt and dueAt', () => {
    useNonUtcTz()
    const r = transformBill(bill())
    expect(r.postedAt).toBe(EXPECTED_DATE)
    expect(r.dueAt).toBe(EXPECTED_DUE)
  })

  it('transformCreditMemo keeps postedAt and dueAt', () => {
    useNonUtcTz()
    const r = transformCreditMemo(creditNote())
    expect(r.postedAt).toBe(EXPECTED_DATE)
    expect(r.dueAt).toBe(EXPECTED_DUE)
  })

  it('transformOrder keeps postedAt', () => {
    useNonUtcTz()
    expect(transformOrder(purchaseOrder()).postedAt).toBe(EXPECTED_DATE)
  })

  it('transformPurchaseOrder keeps postedAt', () => {
    useNonUtcTz()
    expect(transformPurchaseOrder(purchaseOrder()).postedAt).toBe(EXPECTED_DATE)
  })

  it('transformTransaction puts the calendar date on postedAt', () => {
    // Finding 28: `DateString` is a calendar date and used to land on
    // `createdAt` as a fabricated UTC instant, so the SAME underlying record
    // read `2026-06-22` via list_expenses and `2026-06-22T00:00:00.000Z` via
    // list_accounting_transactions. It now lands where it belongs, in the
    // precision the source actually has.
    useNonUtcTz()
    const r = transformTransaction(bankTransaction())
    expect(r.postedAt).toBe(EXPECTED_DATE)
    // Xero reports no creation timestamp for bank transactions, so this is
    // honestly absent rather than filled with the posting date.
    expect(r.createdAt).toBeUndefined()
  })

  it('transformExpense keeps postedAt', () => {
    useNonUtcTz()
    expect(transformExpense(bankTransaction()).postedAt).toBe(EXPECTED_DATE)
  })

  it('transformJournal keeps postedAt and createdAt', () => {
    useNonUtcTz()
    const r = transformJournal(journal())
    expect(r.postedAt).toBe(EXPECTED_DATE)
    expect(r.createdAt?.toISOString()).toBe(EXPECTED_INSTANT)
  })

  it('does not re-read a value that already carries an offset', () => {
    useNonUtcTz()
    // `CreatedDateUTC` sometimes arrives with a real offset. Stamping a `Z`
    // onto that would move the instant by the offset amount.
    const r = transformJournal({ ...journal(), CreatedDateUTC: '2026-09-01T13:45:00+02:00' })
    expect(r.createdAt?.toISOString()).toBe('2026-09-01T11:45:00.000Z')
  })
})
