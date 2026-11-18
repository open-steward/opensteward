/**
 * Siigo implemented 14 methods against endpoints its official API
 * Blueprint (specs/accounting-siigo.apib) does not document and live probes
 * answered 404 for (plus `deleteContact`, undocumented and unconfirmed) —
 * see index.ts's file-header comment for the resource-by-resource evidence.
 * Those 14 are removed; every other method (documented, or confirmed
 * reachable despite being undocumented, or explicitly left for a separate
 * repoint change) stays.
 */
import { describe, expect, it } from 'vitest'
import { SiigoAdapter } from '../../../../../../src/verticals/accounting/adapters/siigo'

const adapter = (): SiigoAdapter => new SiigoAdapter({ clientId: '', clientSecret: '' })

const REMOVED_METHODS = [
  'listAccounts',
  'getAccount',
  'getOrganization',
  'listOrders',
  'getOrder',
  'createOrder',
  'listSalesOrders',
  'getSalesOrder',
  'createSalesOrder',
  'listPurchaseOrders',
  'getPurchaseOrder',
  'createPurchaseOrder',
  'getTaxRate',
  'deleteContact',
] as const

// Documented, confirmed-reachable, or explicitly deferred to the separate
// #21 repoint item — must NOT have been removed.
const KEPT_METHODS = [
  'listInvoices',
  'getInvoice',
  'createInvoice',
  'updateInvoice',
  'deleteInvoice',
  'listBills',
  'getBill',
  'createBill',
  'updateBill',
  'deleteBill',
  'listContacts',
  'getContact',
  'createContact',
  'updateContact',
  'listJournals',
  'getJournal',
  'createJournal',
  'listTransactions',
  'getTransaction',
  'listTaxRates',
  'listExpenses',
  'getExpense',
  'createExpense',
  'listCreditMemos',
  'getCreditMemo',
  'createCreditMemo',
] as const

describe('Siigo phantom-method removal', () => {
  it.each(REMOVED_METHODS)('does not implement %s', (method) => {
    // A router keys on `adapter.<method>` being present to decide 200 vs 501
    // (see e.g. router/accounts.ts) — undefined here is what makes every one
    // of these routes answer 501 instead of hitting a 404 phantom endpoint.
    expect((adapter() as unknown as Record<string, unknown>)[method]).toBeUndefined()
  })

  it.each(KEPT_METHODS)('still implements %s', (method) => {
    expect(typeof (adapter() as unknown as Record<string, unknown>)[method]).toBe('function')
  })
})
