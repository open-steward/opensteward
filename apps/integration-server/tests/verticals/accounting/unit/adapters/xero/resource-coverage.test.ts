/**
 * Xero implemented 3 of the 12 accounting LISTABLE_RESOURCES, and one of the
 * three was wrong.
 *
 * Xero has no separate bills endpoint: a bill is an `Invoices` row with
 * `Type: 'ACCPAY'`, and a sales invoice is `ACCREC`. `listInvoices` filtered by
 * neither, so a live org returned 78 "invoices" that were really 32 invoices
 * and 46 supplier bills — while `bills` reported `skipped`. Anyone summing
 * invoices for revenue was counting payables into it, with nothing to reveal
 * the mix.
 *
 * The other resources come from endpoints the existing grant already reaches
 * (verified live: TaxRates 8, CreditNotes 5, PurchaseOrders 7), plus
 * BankTransactions and ManualJournals, which need scopes added to readScopes.
 *
 * Xero models no sales-order entity and has no order-union endpoint of its
 * own: PurchaseOrders is the only order-like document it exposes, so `orders`
 * reads that same endpoint `purchaseorders` does and returns the same
 * records, tagged `type: 'PURCHASE'`. `salesorders` is not implemented —
 * Quotes (sales quotes) are a different lifecycle with no canonical
 * quote/estimate resource to map them to.
 *
 * `expenses` reads BankTransactions filtered to the SPEND family. It targeted
 * `ExpenseClaims` first, which no grant could reach — Xero rejects
 * `accounting.transactions` outright for an app created on or after
 * 2026-03-02 — so the resource was `skipped` on every sync while the org's
 * spend sat in an endpoint the read-only grant already covered.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { XeroAdapter } from '../../../../../../src/verticals/accounting/adapters/xero'
import { XeroClient } from '../../../../../../src/verticals/accounting/adapters/xero/client'
import type { Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'

const adapter = new XeroAdapter({
  clientId: 'i',
  clientSecret: 's',
  redirectUri: 'http://localhost:3010/auth/accounting/xero/callback',
  scopes: ['openid'],
})
const creds = { accessToken: 'tok', tenantId: 'ten' } as Credentials

function stub(payload: unknown) {
  return vi.spyOn(XeroClient.prototype, 'get').mockResolvedValue(payload as never)
}
afterEach(() => vi.restoreAllMocks())

const ACCREC = { InvoiceID: 'i1', Type: 'ACCREC', InvoiceNumber: 'INV-1', Total: 100 }
const ACCPAY = { InvoiceID: 'b1', Type: 'ACCPAY', InvoiceNumber: 'BILL-1', Total: 200 }

describe('invoices and bills are separated by Type', () => {
  it('asks Xero for ACCREC only, rather than filtering after the fact', async () => {
    const spy = stub({ Invoices: [ACCREC] })
    await adapter.listInvoices(creds, { limit: 10 })
    const params = spy.mock.calls[0]![1] as Record<string, unknown>
    expect(JSON.stringify(params)).toContain('ACCREC')
  })

  it('returns only sales invoices even if the platform sends a mixed page', async () => {
    stub({ Invoices: [ACCREC, ACCPAY] })
    const rows = await adapter.listInvoices(creds, { limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['i1'])
  })

  it('lists bills from the same endpoint, filtered to ACCPAY', async () => {
    const spy = stub({ Invoices: [ACCPAY] })
    const rows = await adapter.listBills!(creds, { limit: 10 })
    expect(JSON.stringify(spy.mock.calls[0]![1])).toContain('ACCPAY')
    expect(rows.map((r) => r.id)).toEqual(['b1'])
  })

  it('never lets a sales invoice through as a bill', async () => {
    stub({ Invoices: [ACCREC, ACCPAY] })
    const rows = await adapter.listBills!(creds, { limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['b1'])
  })
})

describe('the resources the current grant already reaches', () => {
  it.each([
    ['listTaxRates', 'TaxRates', { TaxRates: [{ Name: 'GST', TaxType: 'OUTPUT', DisplayTaxRate: 15 }] }],
    ['listCreditMemos', 'CreditNotes', { CreditNotes: [{ CreditNoteID: 'c1', Total: 10 }] }],
    ['listPurchaseOrders', 'PurchaseOrders', { PurchaseOrders: [{ PurchaseOrderID: 'p1', Total: 10 }] }],
    ['listOrders', 'PurchaseOrders', { PurchaseOrders: [{ PurchaseOrderID: 'p1', Total: 10 }] }],
  ])('%s reads %s', async (method, endpoint, payload) => {
    const spy = stub(payload)
    const rows = await (adapter as unknown as Record<string, Function>)[method]!(creds, { limit: 5 })
    expect(spy.mock.calls[0]![0]).toBe(endpoint)
    expect(rows).toHaveLength(1)
  })
})

describe('the resources that need the added scopes', () => {
  it('listTransactions reads BankTransactions', async () => {
    const spy = stub({ BankTransactions: [{ BankTransactionID: 't1', Total: 5 }] })
    const rows = await adapter.listTransactions!(creds, { limit: 5 })
    expect(spy.mock.calls[0]![0]).toBe('BankTransactions')
    expect(rows).toHaveLength(1)
  })

  it('listJournals reads ManualJournals', async () => {
    const spy = stub({ ManualJournals: [{ ManualJournalID: 'j1' }] })
    const rows = await adapter.listJournals!(creds, { limit: 5 })
    expect(spy.mock.calls[0]![0]).toBe('ManualJournals')
    expect(rows).toHaveLength(1)
  })
})

describe('expenses are spend-money bank transactions', () => {
  /**
   * Not `ExpenseClaims`/`Receipts`. Those need `accounting.transactions`, which
   * a Xero app created on or after 2026-03-02 cannot request — so the resource
   * reported `skipped` on every sync while the org's spend sat in
   * `BankTransactions`, under a scope read-only links already carry.
   */
  it('reads BankTransactions, not an endpoint the app cannot reach', async () => {
    const spy = stub({ BankTransactions: [{ BankTransactionID: 'bt1', Type: 'SPEND' }] })
    await adapter.listExpenses!(creds, { limit: 5 })
    expect(spy.mock.calls[0]![0]).toBe('BankTransactions')
  })

  it('asks Xero for the SPEND family only, rather than filtering a full page here', async () => {
    const spy = stub({ BankTransactions: [] })
    await adapter.listExpenses!(creds, { limit: 5 })
    expect((spy.mock.calls[0]![1] as { where?: string }).where).toBe('Type.StartsWith("SPEND")')
  })

  it('keeps overpayments and prepayments, which are money out too', async () => {
    // An `=="SPEND"` filter would silently drop these.
    stub({
      BankTransactions: [
        { BankTransactionID: 'a', Type: 'SPEND' },
        { BankTransactionID: 'b', Type: 'SPEND-OVERPAYMENT' },
        { BankTransactionID: 'c', Type: 'SPEND-PREPAYMENT' },
      ],
    })
    expect(await adapter.listExpenses!(creds, {})).toHaveLength(3)
  })

  it('never reports money coming in as an expense', async () => {
    // Belt and braces: `where` is Xero's own expression language, and an org
    // that ignores or mis-parses it must not turn a receipt into spend.
    stub({
      BankTransactions: [
        { BankTransactionID: 'a', Type: 'SPEND' },
        { BankTransactionID: 'b', Type: 'RECEIVE' },
      ],
    })
    const rows = await adapter.listExpenses!(creds, {})
    expect(rows.map((r) => r.id)).toEqual(['a'])
  })
})

describe('honest gaps', () => {
  it('every wired list method returns [] rather than throwing on an empty page', async () => {
    stub({})
    for (const m of ['listInvoices', 'listBills', 'listTaxRates', 'listCreditMemos',
                     'listPurchaseOrders', 'listOrders',
                     'listTransactions', 'listJournals', 'listExpenses']) {
      await expect(
        (adapter as unknown as Record<string, Function>)[m]!(creds, {}),
      ).resolves.toEqual([])
    }
  })
})
