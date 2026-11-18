import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { XeroClient } from '../../../../../../src/verticals/accounting/adapters/xero/client'
import { XeroAdapter } from '../../../../../../src/verticals/accounting/adapters/xero'
import {
  fillAccountIds,
  _resetAccountIndex,
} from '../../../../../../src/verticals/accounting/adapters/xero/account-index'
import type { Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'

/**
 * Finding 29 — `accountId` was absent on `orders`, `salesorders` and
 * `purchaseorders`.
 *
 * Finding 17 fixed the five entities whose line items carry `AccountID`.
 * Xero's Quote and PurchaseOrder line items carry only `AccountCode`, verified
 * live against the demo org:
 *
 *     orders          accountId=None  accountCode='200'
 *     salesorders     accountId=None  accountCode='200'
 *     purchaseorders  accountId=None  accountCode='300'
 *     invoices        accountId='d1ebb97b-…'  accountCode='200'
 *
 * So the field was not merely wrong, it was missing, and those line items
 * could not be joined to an account by any route. The code is not a substitute:
 * Xero guarantees it neither unique nor stable, which is why it lives on
 * `Account.customerDefinedCode` rather than being used as a key.
 *
 * `orders` now reads the same `PurchaseOrders` endpoint `purchaseorders` does
 * (Xero has no sales-order entity of its own), so both resources
 * are exercised here against the same fixture shape.
 */

const CREDS = { accessToken: 'tok', tenantId: 'ten-1' } as Credentials

const ACCOUNTS = {
  Accounts: [
    { AccountID: 'guid-200', Code: '200', Name: 'Sales', Type: 'REVENUE', Class: 'REVENUE', Status: 'ACTIVE', Description: '', CurrencyCode: 'USD' },
    { AccountID: 'guid-300', Code: '300', Name: 'Purchases', Type: 'EXPENSE', Class: 'EXPENSE', Status: 'ACTIVE', Description: '', CurrencyCode: 'USD' },
  ],
}

function purchaseOrder(code: string) {
  return {
    PurchaseOrderID: 'po-1', PurchaseOrderNumber: 'PO-1', Contact: { ContactID: 'c-1' },
    DateString: '2026-09-01T00:00:00', DeliveryDateString: '2026-09-30T00:00:00',
    CurrencyCode: 'USD', Total: 100, TotalTax: 0, Status: 'AUTHORISED',
    DeliveryAddress: '', AttentionTo: '',
    LineItems: [{
      LineItemID: 'li-1', Description: 'Consulting', UnitAmount: 100, Quantity: 1,
      TaxAmount: 0, LineAmount: 100, AccountCode: code, ItemCode: '',
    }],
  }
}

const adapter = new XeroAdapter({
  clientId: 'cid', clientSecret: 'secret',
  redirectUri: 'https://example.test/cb', scopes: ['accounting.transactions.read'],
})

afterEach(() => {
  vi.restoreAllMocks()
  _resetAccountIndex()
})

describe('account codes resolve to account ids', () => {
  it('fills accountId on an order line item that only had a code', async () => {
    const get = vi.spyOn(XeroClient.prototype, 'get').mockImplementation(async (path: string) =>
      (path === 'Accounts' ? ACCOUNTS : { PurchaseOrders: [purchaseOrder('200')] }) as never,
    )
    const rows = await adapter.listOrders!(CREDS, withPageSink({}))
    expect(rows[0]!.lineItems![0]!.accountId).toBe('guid-200')
    expect(rows[0]!.lineItems![0]!.accountCode).toBe('200')
    expect(get).toHaveBeenCalledWith('Accounts')
  })

  it('does the same for purchase orders (orders and purchaseorders read the same endpoint)', async () => {
    vi.spyOn(XeroClient.prototype, 'get').mockImplementation(async (path: string) =>
      (path === 'Accounts' ? ACCOUNTS : { PurchaseOrders: [purchaseOrder('300')] }) as never,
    )
    expect((await adapter.listPurchaseOrders!(CREDS, withPageSink({})))[0]!.lineItems![0]!.accountId).toBe('guid-300')
  })

  it('caches the chart of accounts rather than re-fetching per call', async () => {
    // Xero allows 60 calls a minute; a per-request lookup would spend that on
    // a paging client, and a chart of accounts changes on human timescales.
    const get = vi.spyOn(XeroClient.prototype, 'get').mockImplementation(async (path: string) =>
      (path === 'Accounts' ? ACCOUNTS : { PurchaseOrders: [purchaseOrder('200')] }) as never,
    )
    await adapter.listOrders!(CREDS, withPageSink({}))
    await adapter.listOrders!(CREDS, withPageSink({}))
    await adapter.listOrders!(CREDS, withPageSink({}))
    expect(get.mock.calls.filter(([p]) => p === 'Accounts')).toHaveLength(1)
  })

  it('keys the cache per organisation, not per token', async () => {
    // A token refresh happens hourly; keying on it would miss every time.
    const get = vi.spyOn(XeroClient.prototype, 'get').mockImplementation(async (path: string) =>
      (path === 'Accounts' ? ACCOUNTS : { PurchaseOrders: [purchaseOrder('200')] }) as never,
    )
    await adapter.listOrders!(CREDS, withPageSink({}))
    await adapter.listOrders!({ ...CREDS, accessToken: 'refreshed' } as Credentials, withPageSink({}))
    expect(get.mock.calls.filter(([p]) => p === 'Accounts')).toHaveLength(1)

    await adapter.listOrders!({ ...CREDS, tenantId: 'ten-2' } as Credentials, withPageSink({}))
    expect(get.mock.calls.filter(([p]) => p === 'Accounts')).toHaveLength(2)
  })

  it('skips the lookup entirely when nothing needs resolving', async () => {
    // Invoices already carry AccountID; they must not pay for a second call.
    const get = vi.spyOn(XeroClient.prototype, 'get').mockImplementation(async () => ({ PurchaseOrders: [] }) as never)
    await adapter.listOrders!(CREDS, withPageSink({}))
    expect(get.mock.calls.filter(([p]) => p === 'Accounts')).toHaveLength(0)
  })

  it('returns the records unresolved rather than failing when the lookup errors', async () => {
    // A missing accountId is the status quo for these entities. Failing the
    // whole list because a secondary lookup errored turns a partial answer
    // into no answer.
    vi.spyOn(XeroClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path === 'Accounts') throw new Error('429 rate limited')
      return { PurchaseOrders: [purchaseOrder('200')] } as never
    })
    const rows = await adapter.listOrders!(CREDS, withPageSink({}))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.lineItems![0]!.accountId).toBeUndefined()
    expect(rows[0]!.lineItems![0]!.accountCode).toBe('200')
  })

  it('never overwrites an id the platform did supply', () => {
    // Xero's own id is authoritative; a code collision must not replace it.
    const records = [{ lineItems: [{ accountId: 'authoritative', accountCode: '200' }] }]
    fillAccountIds(records, new Map([['200', 'guid-200']]))
    expect(records[0]!.lineItems[0]!.accountId).toBe('authoritative')
  })

  it('leaves a line item alone when its code is not in the chart', () => {
    const records = [{ lineItems: [{ accountCode: '999' }] as Array<{ accountId?: string; accountCode?: string }> }]
    fillAccountIds(records, new Map([['200', 'guid-200']]))
    expect(records[0]!.lineItems[0]!.accountId).toBeUndefined()
  })
})
