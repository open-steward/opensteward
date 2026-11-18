/**
 * What the accounting sandbox serves, declared rather than derived.
 *
 * Deriving adapter method names from the resource type does not work, and not
 * only in the awkward verticals. Within accounting alone, `'taxrates'` maps to
 * `listTaxRates` and `'creditmemos'` to `listCreditMemos` — the internal
 * capitalisation is unrecoverable from the lowercase resource string, and the
 * router prefix, the `RESOURCE` constant and the method name are three
 * independent tokenisations of the same concept. (docsign is worse: one
 * resource is `audit-trail-entries.ts`, `/audit_trail_entries` and
 * `'audit_trail_entries'` simultaneously.)
 *
 * `resourceType` MUST equal the `RESOURCE` constant in the matching router, and
 * the method names MUST match `adapter/interface.ts` — `check:sandbox-coverage`
 * enforces the second half so this file cannot silently drift.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  AccountSchema,
  BillSchema,
  ContactSchema,
  CreditMemoSchema,
  ExpenseSchema,
  InvoiceSchema,
  JournalSchema,
  OrderSchema,
  OrganizationSchema,
  PurchaseOrderSchema,
  SalesOrderSchema,
  TaxRateSchema,
  TransactionSchema,
} from '../schema'

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  // The one irregular shape in accounting: no lister, no id argument.
  {
    resourceType: 'organizations',
    schema: OrganizationSchema,
    get: 'getOrganization',
    singletonId: 'self',
  },
  {
    resourceType: 'invoices',
    schema: InvoiceSchema,
    list: 'listInvoices',
    get: 'getInvoice',
    create: 'createInvoice',
    update: 'updateInvoice',
    delete: 'deleteInvoice',
    seed: 3,
  },
  {
    resourceType: 'bills',
    schema: BillSchema,
    list: 'listBills',
    get: 'getBill',
    create: 'createBill',
    update: 'updateBill',
    delete: 'deleteBill',
    seed: 3,
  },
  {
    resourceType: 'contacts',
    schema: ContactSchema,
    list: 'listContacts',
    get: 'getContact',
    create: 'createContact',
    update: 'updateContact',
    delete: 'deleteContact',
    seed: 3,
  },
  {
    resourceType: 'accounts',
    schema: AccountSchema,
    list: 'listAccounts',
    get: 'getAccount',
    seed: 3,
  },
  {
    resourceType: 'journals',
    schema: JournalSchema,
    list: 'listJournals',
    get: 'getJournal',
    create: 'createJournal',
    seed: 3,
  },
  {
    resourceType: 'transactions',
    schema: TransactionSchema,
    list: 'listTransactions',
    get: 'getTransaction',
    seed: 3,
  },
  // 'taxrates' ↔ listTaxRates — the capitalisation derivation cannot recover.
  {
    resourceType: 'taxrates',
    schema: TaxRateSchema,
    list: 'listTaxRates',
    get: 'getTaxRate',
    seed: 3,
  },
  {
    resourceType: 'expenses',
    schema: ExpenseSchema,
    list: 'listExpenses',
    get: 'getExpense',
    create: 'createExpense',
    seed: 3,
  },
  {
    resourceType: 'creditmemos',
    schema: CreditMemoSchema,
    list: 'listCreditMemos',
    get: 'getCreditMemo',
    create: 'createCreditMemo',
    seed: 3,
  },
  {
    resourceType: 'orders',
    schema: OrderSchema,
    list: 'listOrders',
    get: 'getOrder',
    create: 'createOrder',
    seed: 3,
  },
  {
    resourceType: 'salesorders',
    schema: SalesOrderSchema,
    list: 'listSalesOrders',
    get: 'getSalesOrder',
    create: 'createSalesOrder',
    seed: 3,
  },
  {
    resourceType: 'purchaseorders',
    schema: PurchaseOrderSchema,
    list: 'listPurchaseOrders',
    get: 'getPurchaseOrder',
    create: 'createPurchaseOrder',
    seed: 3,
  },
]
