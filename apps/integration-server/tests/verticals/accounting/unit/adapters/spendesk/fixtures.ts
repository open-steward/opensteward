/**
 * Spendesk fixtures, built from the documented shapes.
 *
 * `searchPayable` is the `searchPayable` schema's own example from
 * https://developer.spendesk.com/reference/v1-search-payables, verbatim.
 * `payable` fills the required fields of the `payable` schema from
 * https://developer.spendesk.com/reference/v1-get-payable-by-id (the
 * reference ships no response example) with values of the documented types
 * and enums. `account` does the same for
 * https://developer.spendesk.com/reference/v1-get-accounts.
 */
import type {
  SpendeskPayable,
  SpendeskSearchPayable,
} from '../../../../../../src/verticals/accounting/adapters/spendesk/transform/expense'
import type { SpendeskAccount } from '../../../../../../src/verticals/accounting/adapters/spendesk/transform/account'

export function searchPayable(
  overrides: Partial<SpendeskSearchPayable> = {},
): SpendeskSearchPayable {
  return {
    id: 'bc9cef35-401d-4ea4-b384-ed725e6685cf',
    state: 'toExport',
    amount: 1500,
    currency: 'EUR',
    functionalAmount: 1500,
    functionalCurrency: 'EUR',
    creationDate: '2024-06-15T10:30:00.000Z',
    memberId: 'usr_001',
    kind: 'expense',
    subType: 'invoice',
    description: 'Office supplies Q2',
    firstCreatedAt: '2024-06-15T10:30:00.000Z',
    type: 'bill',
    allocations: [],
    itemLines: [
      {
        netAmount: 1250,
        grossAmount: 1500,
        vatAmount: 250,
        vatAdjustment: 0,
        analyticalFieldAssociations: [],
        vatRate: 20,
      },
    ],
    functionalExchangeRate: 1,
    spendingExchangeRate: 1,
    counterparty: { type: 'supplier', supplierId: 'sup_xyz' },
    ...overrides,
  }
}

export function payable(overrides: Partial<SpendeskPayable> = {}): SpendeskPayable {
  return {
    id: 'bc9cef35-401d-4ea4-b384-ed725e6685cf',
    version: 3,
    type: 'invoicePurchase',
    userId: 'usr_001',
    bookkeepingStatus: 'prepared',
    companyId: 'cmp_001',
    teamId: null,
    teamName: null,
    payableDate: '2024-06-15',
    accountingDate: null,
    invoiceDueDate: '2024-07-15',
    amount: 1500,
    currency: 'EUR',
    functionalAmount: 1500,
    functionalCurrency: 'EUR',
    functionalExchangeRate: 1,
    outstandingAmount: 1500,
    invoiceNumber: 'SUPP-INV-100',
    purchaseOrderNumber: null,
    creditNoteNumber: null,
    referenceInvoiceNumber: null,
    description: 'Office supplies Q2',
    exportedAt: null,
    createdAt: '2024-06-15T10:30:00Z',
    counterparty: {
      id: 'sup_xyz',
      type: 'supplier',
      name: 'Acme Ltd',
      accountPayable: { id: 'ap_001', generalAccountCode: '401000', auxiliaryAccountCode: 'ACME' },
    },
    lineItems: [
      {
        expenseAccount: { id: 'acc_606', code: '606000', description: 'Office supplies' },
        vatAccount: { id: 'vat_20', code: '445660', description: null, rate: 20 },
        financial: { vatAmount: 250, vatAdjustmentAmount: 0, netAmount: 1250, grossAmount: 1500 },
      },
    ],
    analyticalProperties: [],
    allocations: [],
    ...overrides,
  }
}

export function account(overrides: Partial<SpendeskAccount> = {}): SpendeskAccount {
  return {
    id: '5f0c1f9e-8b1a-4a52-9d0e-0c8a1f7e2b31',
    name: 'Office supplies',
    description: null,
    type: 'expense',
    code: '606000',
    creditCode: null,
    auxiliaryCode: null,
    externalId: null,
    purpose: 'company',
    taxRate: null,
    currency: null,
    isAvailable: true,
    isArchived: false,
    companyId: 'cmp_001',
    createdAt: '2024-01-10T08:00:00Z',
    defaultFor: null,
    ...overrides,
  }
}
