/**
 * Canonical schema barrel for the accounting vertical. The OpenAPI generator
 * walks every Zod schema exported from this file and registers it under
 * `components.schemas`. Always re-export new schemas here.
 */

// Shared primitives (no value exports today; kept for parity with other verticals)
export * from './shared'

// Connections (per-vertical view of the connection record)
export {
  ConnectionStatusSchema,
  ConnectionSchema,
  UpdateConnectionBodySchema,
  computeStatus,
} from './connection'
export type { ConnectionStatus, Connection, UpdateConnectionBody } from './connection'

// Organizations
export { OrganizationSchema } from './organization'
export type { Organization } from './organization'

// Accounts (chart of accounts)
export {
  AccountStatusSchema,
  AccountTypeSchema,
  AccountTaxonomySchema,
  AccountSchema,
} from './account'
export type { AccountStatus, AccountType, AccountTaxonomy, Account } from './account'

// Contacts (customers / suppliers / vendors)
export { ContactPaymentMethodSchema, ContactSchema, TaxExemptionSchema } from './contact'
export type { ContactPaymentMethod, Contact, TaxExemption } from './contact'

// Tax rates
export { TaxRateSchema } from './taxrate'
export type { TaxRate } from './taxrate'

// Invoices
export {
  InvoiceStatusSchema,
  InvoiceTypeSchema,
  PaymentCollectionMethodSchema,
  InvoiceSchema,
} from './invoice'
export type { InvoiceStatus, InvoiceType, PaymentCollectionMethod, Invoice } from './invoice'

// Bills
export { BillStatusSchema, BillSchema } from './bill'
export type { BillStatus, Bill } from './bill'

// Credit memos
export { CreditMemoStatusSchema, CreditMemoSchema, CreditMemoApplicationSchema } from './creditmemo'
export type { CreditMemoStatus, CreditMemo, CreditMemoApplication } from './creditmemo'

// Expenses
export { ExpenseSchema } from './expense'
export type { Expense } from './expense'

// Journals
export { JournalSchema } from './journal'
export type { Journal } from './journal'

// Transactions (payments / receipts / transfers / reconciliation)
export * from './transaction'

// Orders (sales + purchase as a polymorphic shape)
export * from './order'

// Sales orders
export * from './salesorder'

// Purchase orders
export * from './purchaseorder'

// Webhook envelope
export * from './webhook'
