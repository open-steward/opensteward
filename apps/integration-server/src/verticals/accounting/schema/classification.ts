/**
 * Field classification for every listable accounting resource — see
 * docs/security/data-classification.md. Unlisted fields fall to the `'*'`
 * default (`internal`); `metadata` (the upstream payload) is implicit PII.
 *
 * `scripts/check-field-classification.ts` fails the build when a listable
 * resource has no entry here, or a personal-looking field is left internal.
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import {
  AccountSchema,
  BillSchema,
  ContactSchema,
  CreditMemoSchema,
  ExpenseSchema,
  InvoiceSchema,
  JournalSchema,
  OrderSchema,
  PurchaseOrderSchema,
  SalesOrderSchema,
  TaxRateSchema,
  TransactionSchema,
} from './index'

/** resourceType (as in sync/listable-resources.ts) → canonical schema. */
export const RESOURCE_SCHEMAS = {
  invoices: InvoiceSchema,
  bills: BillSchema,
  contacts: ContactSchema,
  accounts: AccountSchema,
  journals: JournalSchema,
  transactions: TransactionSchema,
  taxrates: TaxRateSchema,
  expenses: ExpenseSchema,
  creditmemos: CreditMemoSchema,
  orders: OrderSchema,
  salesorders: SalesOrderSchema,
  purchaseorders: PurchaseOrderSchema,
}

const LINE_AMOUNTS: ResourceClassification = {
  'lineItems[].unitAmount': R.financial,
  'lineItems[].discountAmount': R.financial,
  'lineItems[].taxAmount': R.financial,
  'lineItems[].totalAmount': R.financial,
  'lineItems[].refundAmount': R.financial,
  'lineItems[].notes': R.pii,
}

/** Invoices, bills and credit memos share one document shape. */
const DOCUMENT: ResourceClassification = {
  '*': R.internal,
  totalAmount: R.financial,
  taxAmount: R.financial,
  discountAmount: R.financial,
  paidAmount: R.financial,
  balanceAmount: R.financial,
  refundAmount: R.financial,
  refundReason: R.pii,
  notes: R.pii,
  'attachments[].url': R.pii,
  ...LINE_AMOUNTS,
}

const ORDER: ResourceClassification = {
  '*': R.internal,
  totalAmount: R.financial,
  billingAddress: R.piiAddress,
  shippingAddress: R.piiAddress,
  ...LINE_AMOUNTS,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  invoices: DOCUMENT,
  bills: DOCUMENT,
  creditmemos: DOCUMENT,
  contacts: {
    '*': R.internal,
    name: R.piiName,
    firstName: R.piiName,
    lastName: R.piiName,
    identification: R.pii,
    taxNumber: R.pii,
    'emails[].email': R.piiEmail,
    'telephones[].telephone': R.piiPhone,
    billingAddress: R.piiAddress,
    shippingAddress: R.piiAddress,
    paymentMethods: R.pii,
    'associatedContacts[].name': R.piiName,
    portalUrl: R.pii,
  },
  accounts: { '*': R.internal, balance: R.financial },
  journals: {
    '*': R.internal,
    description: R.pii,
    taxAmount: R.financial,
    'lineItems[].description': R.pii,
    'lineItems[].debitAmount': R.financial,
    'lineItems[].creditAmount': R.financial,
    'lineItems[].taxAmount': R.financial,
    'lineItems[].totalAmount': R.financial,
  },
  transactions: {
    '*': R.internal,
    memo: R.pii,
    customerMessage: R.pii,
    subTotalAmount: R.financial,
    taxAmount: R.financial,
    totalAmount: R.financial,
    'contacts[].name': R.piiName,
    'lineItems[].description': R.pii,
    'lineItems[].unitAmount': R.financial,
    'lineItems[].totalAmount': R.financial,
  },
  taxrates: { '*': R.internal },
  expenses: {
    '*': R.internal,
    taxAmount: R.financial,
    totalAmount: R.financial,
    reimbursedAmount: R.financial,
    ...LINE_AMOUNTS,
  },
  orders: ORDER,
  salesorders: ORDER,
  purchaseorders: ORDER,
}
