/**
 * Every 1C:Enterprise resource method called an invented OData entity
 * set (13 English names such as `InvoiceOut`, none following 1C's
 * `<Type>_<ObjectName>` convention, none reachable on the reference host).
 * All 25 methods were removed rather than left as broken stubs; the router
 * for each resource must therefore answer 501, and the adapter's own
 * `metadata.ts` must declare every one of the vertical's 13 resources
 * unavailable with a reason — not silently omit them.
 */
import { describe, expect, it } from 'vitest'
import { OneCEnterpriseAdapter } from '../../../../../../src/verticals/accounting/adapters/1centerprise'
import { metadata } from '../../../../../../src/verticals/accounting/adapters/1centerprise/metadata'

const adapter = (): OneCEnterpriseAdapter =>
  new OneCEnterpriseAdapter({ clientId: '', clientSecret: '', redirectUri: '', scopes: [] })

// One per removed method (25 total across the 13 invented entity sets).
const REMOVED_METHODS = [
  'getOrganization',
  'listInvoices',
  'getInvoice',
  'listBills',
  'getBill',
  'listContacts',
  'getContact',
  'listAccounts',
  'getAccount',
  'listJournals',
  'getJournal',
  'listTransactions',
  'getTransaction',
  'listTaxRates',
  'getTaxRate',
  'listExpenses',
  'getExpense',
  'listCreditMemos',
  'getCreditMemo',
  'listOrders',
  'getOrder',
  'listSalesOrders',
  'getSalesOrder',
  'listPurchaseOrders',
  'getPurchaseOrder',
] as const

const ALL_RESOURCES = [
  'account',
  'bill',
  'contact',
  'creditmemo',
  'expense',
  'invoice',
  'journal',
  'order',
  'organization',
  'purchaseorder',
  'salesorder',
  'taxrate',
  'transaction',
] as const

describe('1C:Enterprise phantom-method removal', () => {
  it.each(REMOVED_METHODS)('does not implement %s', (method) => {
    // A router keys on `adapter.<method>` being present to decide 200 vs 501
    // (see e.g. router/accounts.ts) — undefined here is what makes every one
    // of these routes answer 501 instead of hitting a dead entity set.
    expect((adapter() as unknown as Record<string, unknown>)[method]).toBeUndefined()
  })

  it('declares every accounting resource unavailable, none available', () => {
    expect(metadata.platform).toBe('1centerprise')
    expect(metadata.availableResources).toEqual([])
    expect(metadata.totalResources).toBe(ALL_RESOURCES.length)
    const declared = metadata.unavailableResources.map((u) => u.resource).slice().sort()
    expect(declared).toEqual([...ALL_RESOURCES].sort())
  })

  it('gives every unavailable resource a non-empty reason', () => {
    for (const entry of metadata.unavailableResources) {
      expect(entry.reason.length).toBeGreaterThan(20)
    }
  })
})
