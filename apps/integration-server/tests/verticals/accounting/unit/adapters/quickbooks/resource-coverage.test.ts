/**
 * bill, journal, creditmemo, expense, purchaseorder, taxrate and order all had
 * unit-tested transforms with nothing calling them — listBills/getBill etc.
 * did not exist on the adapter, so every one of these routes 501'd
 * (router/*.ts falls back to 501 when the optional adapter method is absent).
 *
 * QuickBooks has no sales-order entity (SalesOrder is QBW/desktop-only); the
 * `order` resource reads Estimate, the platform's nearest quote-like
 * document, same as the existing `type: 'SALES'` transform already mapped.
 *
 * expense reads the `Purchase` entity, not `Expense` — QBO's actual object
 * name for a spend transaction — while purchaseorder reads the distinct
 * `PurchaseOrder` entity. Pinned separately so a future edit can't collapse
 * the two into the same query.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { QuickBooksAdapter } from '../../../../../../src/verticals/accounting/adapters/quickbooks'
import { QBOClient } from '../../../../../../src/verticals/accounting/adapters/quickbooks/client'
import type { Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'

const adapter = new QuickBooksAdapter({
  clientId: 'i',
  clientSecret: 's',
  redirectUri: 'http://localhost:3010/auth/accounting/quickbooks/callback',
  scopes: ['com.intuit.quickbooks.accounting'],
})
const creds = { accessToken: 'tok', tenantId: '12345' } as Credentials

function stubQuery(payload: unknown) {
  return vi.spyOn(QBOClient.prototype, 'query').mockResolvedValue(payload as never)
}
function stubGet(payload: unknown) {
  return vi.spyOn(QBOClient.prototype, 'get').mockResolvedValue(payload as never)
}
afterEach(() => vi.restoreAllMocks())

describe('list methods query the entity the issue named', () => {
  it.each([
    ['listBills', 'Bill', { QueryResponse: { Bill: [{ Id: 'b1', TotalAmt: 10, Balance: 10 }] } }],
    ['listJournals', 'JournalEntry', { QueryResponse: { JournalEntry: [{ Id: 'j1' }] } }],
    ['listCreditMemos', 'CreditMemo', { QueryResponse: { CreditMemo: [{ Id: 'c1', TotalAmt: 10, RemainingCredit: 10 }] } }],
    ['listExpenses', 'Purchase', { QueryResponse: { Purchase: [{ Id: 'e1', TotalAmt: 10, Line: [] }] } }],
    ['listPurchaseOrders', 'PurchaseOrder', { QueryResponse: { PurchaseOrder: [{ Id: 'p1', TotalAmt: 10 }] } }],
    ['listTaxRates', 'TaxRate', { QueryResponse: { TaxRate: [{ Id: 't1', RateValue: 5 }] } }],
    ['listOrders', 'Estimate', { QueryResponse: { Estimate: [{ Id: 'o1', TotalAmt: 10 }] } }],
  ])('%s queries %s', async (method, entity, payload) => {
    const spy = stubQuery(payload)
    const rows = await (adapter as unknown as Record<string, Function>)[method]!(creds, { limit: 5 })
    expect(spy.mock.calls[0]![0]).toContain(`SELECT * FROM ${entity}`)
    expect(rows).toHaveLength(1)
  })

  it('never confuses Purchase (expense) with PurchaseOrder', async () => {
    const spy = stubQuery({ QueryResponse: { Purchase: [] } })
    await adapter.listExpenses!(creds, {})
    expect(String(spy.mock.calls[0]![0])).not.toContain('PurchaseOrder')
  })
})

describe('get-by-id methods hit the id-scoped path the issue named', () => {
  it.each([
    ['getBill', 'bill/b1', { Bill: { Id: 'b1', TotalAmt: 10, Balance: 10 } }],
    ['getJournal', 'journalentry/j1', { JournalEntry: { Id: 'j1' } }],
    ['getCreditMemo', 'creditmemo/c1', { CreditMemo: { Id: 'c1', TotalAmt: 10, RemainingCredit: 10 } }],
    ['getExpense', 'purchase/c1', { Purchase: { Id: 'c1', TotalAmt: 10, Line: [] } }],
    ['getPurchaseOrder', 'purchaseorder/c1', { PurchaseOrder: { Id: 'c1', TotalAmt: 10 } }],
    ['getTaxRate', 'taxrate/c1', { TaxRate: { Id: 'c1', RateValue: 5 } }],
    ['getOrder', 'estimate/c1', { Estimate: { Id: 'c1', TotalAmt: 10 } }],
  ])('%s reads %s', async (method, path, payload) => {
    const id = path.split('/')[1]!
    const spy = stubGet(payload)
    const row = await (adapter as unknown as Record<string, Function>)[method]!(creds, id)
    expect(spy.mock.calls[0]![0]).toBe(path)
    expect(row.id).toBe(id)
  })
})

describe('honest gaps', () => {
  it('every wired list method returns [] rather than throwing on an empty page', async () => {
    stubQuery({ QueryResponse: {} })
    for (const m of ['listBills', 'listJournals', 'listCreditMemos', 'listExpenses',
                     'listPurchaseOrders', 'listTaxRates', 'listOrders']) {
      await expect(
        (adapter as unknown as Record<string, Function>)[m]!(creds, {}),
      ).resolves.toEqual([])
    }
  })
})
