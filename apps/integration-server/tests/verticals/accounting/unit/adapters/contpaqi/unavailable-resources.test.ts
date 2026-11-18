/**
 * Every ContPAQi resource method called
 * `https://api.contpaqi.com/v1/...`, a host that answers every request with
 * HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a
 * live probe. All 35 methods across 13 resources were removed rather than
 * left as broken stubs; the router for each resource must therefore answer
 * 501, and the adapter's own `metadata.ts` must declare every one of the
 * vertical's 13 resources unavailable with a reason — not silently omit
 * them. Auth (`getAuthUrl`/`exchangeCode`/`refreshCredentials`), which
 * targets the separate `identity.contpaqi.com` host, is untouched and stays.
 */
import { describe, expect, it } from 'vitest'
import { ContpaqiAdapter } from '../../../../../../src/verticals/accounting/adapters/contpaqi'
import { metadata } from '../../../../../../src/verticals/accounting/adapters/contpaqi/metadata'

const adapter = (): ContpaqiAdapter =>
  new ContpaqiAdapter({ clientId: '', clientSecret: '', redirectUri: '', scopes: [] })

// One per removed method (35 total across the 13 resources).
const REMOVED_METHODS = [
  'getOrganization',
  'listInvoices',
  'getInvoice',
  'createInvoice',
  'updateInvoice',
  'listBills',
  'getBill',
  'listContacts',
  'getContact',
  'createContact',
  'updateContact',
  'listAccounts',
  'getAccount',
  'listJournals',
  'getJournal',
  'createJournal',
  'listTransactions',
  'getTransaction',
  'listTaxRates',
  'getTaxRate',
  'listExpenses',
  'getExpense',
  'createExpense',
  'listCreditMemos',
  'getCreditMemo',
  'createCreditMemo',
  'listOrders',
  'getOrder',
  'createOrder',
  'listSalesOrders',
  'getSalesOrder',
  'createSalesOrder',
  'listPurchaseOrders',
  'getPurchaseOrder',
  'createPurchaseOrder',
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

describe('ContPAQi phantom-method removal', () => {
  it.each(REMOVED_METHODS)('does not implement %s', (method) => {
    // A router keys on `adapter.<method>` being present to decide 200 vs 501
    // (see e.g. router/accounts.ts) — undefined here is what makes every one
    // of these routes answer 501 instead of hitting the dead host.
    expect((adapter() as unknown as Record<string, unknown>)[method]).toBeUndefined()
  })

  it('still implements auth', () => {
    const a = adapter() as unknown as Record<string, unknown>
    expect(typeof a['getAuthUrl']).toBe('function')
    expect(typeof a['exchangeCode']).toBe('function')
    expect(typeof a['refreshCredentials']).toBe('function')
  })

  it('declares every accounting resource unavailable, none available', () => {
    expect(metadata.platform).toBe('contpaqi')
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
