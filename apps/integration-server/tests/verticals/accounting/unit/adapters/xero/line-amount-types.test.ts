import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapLineAmountTypes } from '../../../../../../src/verticals/accounting/adapters/shared/transform'
import { transformInvoice, type XeroInvoice } from '../../../../../../src/verticals/accounting/adapters/xero/transform/invoice'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import { transformQuote, type XeroQuote } from '../../../../../../src/verticals/accounting/adapters/xero/transform/quote'
import { QuoteSchema } from '../../../../../../src/verticals/accounting/schema/quote'

/**
 * Finding 27b — whether line amounts include tax had no canonical field.
 *
 * Two documents from the same org reconcile by different arithmetic:
 *
 *     INV-0027  header 39600, line total 39600                (inclusive)
 *     CN-0014   header 54125, line total 50000 + tax 4125     (exclusive)
 *
 * and nothing in either response said which applied. It was only ever
 * reachable through `metadata`, which is gone by design.
 *
 * Inference from the numbers is not a substitute: it breaks on zero-tax lines,
 * mixed rates, multi-line rounding, and single-line documents where inclusive
 * and exclusive coincide. Reconciliation should not rest on a guess.
 */

describe('mapLineAmountTypes', () => {
  it('maps Inclusive to true', () => {
    expect(mapLineAmountTypes('Inclusive')).toBe(true)
  })

  it('maps Exclusive to false', () => {
    expect(mapLineAmountTypes('Exclusive')).toBe(false)
  })

  it('maps NoTax to null rather than defaulting to false', () => {
    // With no tax applied, inclusive and exclusive give the same total, so
    // `false` would assert a distinction the document does not make. The
    // handover called this out specifically.
    expect(mapLineAmountTypes('NoTax')).toBeNull()
  })

  it('is case-insensitive, since Xero has shipped both casings', () => {
    expect(mapLineAmountTypes('INCLUSIVE')).toBe(true)
    expect(mapLineAmountTypes('exclusive')).toBe(false)
  })

  it('returns undefined for an absent or unrecognised value', () => {
    // Absent means "we do not know", which is different from `null` ("no tax
    // applies"). Collapsing the two would lose that.
    expect(mapLineAmountTypes(undefined)).toBeUndefined()
    expect(mapLineAmountTypes('SomethingNew')).toBeUndefined()
    expect(mapLineAmountTypes(42)).toBeUndefined()
  })
})

describe('the field reaches the canonical record', () => {
  function invoice(lineAmountTypes?: string): XeroInvoice {
    return {
      InvoiceID: 'inv-1', Type: 'ACCREC', Status: 'AUTHORISED', InvoiceNumber: 'INV-0027',
      Reference: '', Contact: { ContactID: 'c-1', Name: 'Acme' },
      DateString: '2026-09-01T00:00:00', DueDateString: '2026-09-07T00:00:00',
      Total: 396, TotalTax: 0, AmountDue: 396, AmountPaid: 0, CurrencyCode: 'USD',
      LineItems: [], Url: '',
      ...(lineAmountTypes ? { LineAmountTypes: lineAmountTypes } : {}),
    } as XeroInvoice
  }

  it('publishes the inclusive case, in output the canonical schema accepts', () => {
    // The field is only worth publishing if it survives InvoiceSchema. A
    // transform may set `lineAmountsIncludeTax` and still emit a document the
    // schema rejects or strips, in which case no consumer ever sees it.
    const result = transformInvoice(invoice('Inclusive'))
    expect(result.lineAmountsIncludeTax).toBe(true)
    expect(InvoiceSchema.parse(result).lineAmountsIncludeTax).toBe(true)
  })

  it('publishes the exclusive case', () => {
    expect(transformInvoice(invoice('Exclusive')).lineAmountsIncludeTax).toBe(false)
  })

  it('omits it when the platform said nothing', () => {
    expect(transformInvoice(invoice()).lineAmountsIncludeTax).toBeUndefined()
  })
})

/**
 * The class guard. Every document with line items reconciles by one of the two
 * arithmetics, so every one of them needs to say which.
 */
describe('guard — every line-item-bearing entity publishes the tax treatment', () => {
  const XERO = join(__dirname, '../../../../../../src/verticals/accounting/adapters/xero/transform')
  const withLineItems = readdirSync(XERO)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: f.replace(/\.ts$/, ''), body: readFileSync(join(XERO, f), 'utf8') }))
    .filter((t) => /\n\s*lineItems: /.test(t.body))
    // Journals are excluded deliberately: a ledger entry is not a tax
    // document, Xero's Journal carries no `LineAmountTypes`, and adding a
    // field that is structurally always absent would be noise rather than
    // information.
    .filter((t) => t.name !== 'journal')

  it('finds the entities it means to check', () => {
    expect(withLineItems.length).toBeGreaterThan(5)
  })

  it('all of them map LineAmountTypes', () => {
    const missing = withLineItems
      .filter((t) => !/lineAmountsIncludeTax:/.test(t.body))
      .map((t) => t.name)
    expect(missing).toEqual([])
  })
})

/**
 * Finding 31 — the Quote endpoint is the exception, and the reason is not
 * where it looks.
 *
 * Quotes reported `lineAmountsIncludeTax: true` on a quote whose lines are
 * tax-exclusive, under-reporting it by 47,641 minor units. (Found when Xero
 * quotes were mapped onto `orders` and `salesorders`; a later change moved them off
 * those, and `quote` inherited the same mapping.) The obvious
 * diagnosis — "the Quote mapper defaults instead of reading LineAmountTypes"
 * — is wrong: the mapper called `mapLineAmountTypes(raw.LineAmountTypes)`, and
 * the emitted flag DID vary across quotes.
 *
 * The raw payload settles it. Xero returns quote `LineAmount` tax-EXCLUSIVE
 * regardless of what `LineAmountTypes` says — `sum(LineAmount)` equals
 * `SubTotal` on all three quotes in the demo org, never `Total`, including the
 * two Xero labels INCLUSIVE:
 *
 *     QU-0001  INCLUSIVE  SubTotal 5444.69  Total 5921.10  lineSum 5444.69
 *     QU-0002  INCLUSIVE  SubTotal 4157.04  Total 4500.00  lineSum 4157.04
 *     QU-0003  EXCLUSIVE  SubTotal  160.00  Total  174.00  lineSum  160.00
 *
 * On quotes the field describes how amounts were ENTERED, not what the API
 * returns. Invoices and purchase orders do follow it — they reconcile 32/32
 * and 7/7 against live data — so this is specific to the Quote endpoint.
 *
 * The canonical flag describes OUR `lineItems[].totalAmount`, which is mapped
 * from `LineAmount`. On this path that is always exclusive, so the flag is
 * always false.
 */
describe('Xero quotes: the flag describes our amounts, not Xero’s label', () => {
  function quote(lineAmountTypes: string): XeroQuote {
    return {
      QuoteID: 'q-1', QuoteNumber: 'QU-0001', Contact: { ContactID: 'c-1' },
      DateString: '2026-09-01T00:00:00', ExpiryDateString: '2026-09-30T00:00:00',
      CurrencyCode: 'USD', SubTotal: 5444.69, TotalTax: 476.41, Total: 5921.1, Status: 'SENT',
      LineAmountTypes: lineAmountTypes,
      LineItems: [{
        LineItemID: 'li-1', Description: 'Consulting', UnitAmount: 5444.69, Quantity: 1,
        TaxAmount: 476.41, LineAmount: 5444.69, AccountCode: '200', AccountID: 'a-1', ItemCode: '',
      }],
    }
  }

  it.each(['Inclusive', 'Exclusive', 'NoTax'])(
    'reports false even when Xero says %s, in output the canonical schema accepts',
    (t) => {
      const result = transformQuote(quote(t))
      expect(result.lineAmountsIncludeTax).toBe(false)
      expect(QuoteSchema.parse(result).lineAmountsIncludeTax).toBe(false)
    },
  )

  it('is arithmetically right: lines plus tax reconcile to the header', () => {
    // The assertion that would have caught the original defect. Under the
    // declared treatment the numbers must add up.
    const r = transformQuote(quote('Inclusive'))
    const lines = r.lineItems ?? []
    const sum = lines.reduce((a, l) => a + (l.totalAmount ?? 0), 0)
    const tax = lines.reduce((a, l) => a + (l.taxAmount ?? 0), 0)
    expect(r.lineAmountsIncludeTax).toBe(false)
    expect(sum).toBe(r.subtotalAmount)
    expect(sum + tax).toBe(r.totalAmount)
  })

  it.each(['purchaseorder', 'order'])(
    '%s keeps reading the field, because purchase orders honour it',
    (name) => {
      // Guards the fix from being over-applied: POs reconcile 7/7 against
      // live data, and `order` reads the same /PurchaseOrders records, so
      // hard-coding false there would break them.
      const dir = join(__dirname, '../../../../../../src/verticals/accounting/adapters/xero/transform')
      const src = readFileSync(join(dir, `${name}.ts`), 'utf8')
      expect(src).toMatch(/lineAmountsIncludeTax: mapLineAmountTypes\(/)
    },
  )
})
