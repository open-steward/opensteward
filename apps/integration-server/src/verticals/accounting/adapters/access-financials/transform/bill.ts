/**
 * Access Financials purchase transaction header → canonical Bill.
 *
 * Read from `creditors.transactions.allTransactions.header`, the purchase
 * transaction enquiry. The "Query Transaction Headers" section of
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/purchase-transactions
 * lists the fields read here: "accountCode accountName date periodNumber
 * orderNumber transactionType headerRef batched net tax description gross
 * outstanding reconciled auditNo yearLabel dueDate ...". The live schema
 * types them on `PurchaseTransactionEnquiryHeader`: `auditNo: Int`, `date`
 * and `dueDate: DateOnly`, `transactionType: PurchaseTransactionEnquiryType`
 * (NotSet Invoice CreditNote Payment CreditAdjustment DebitAdjustment
 * InvoiceRegisterCreditNote InvoiceRegisterInvoice).
 *
 * The id is `auditNo`, the key `getBill` filters on (the enquiry has no
 * `primaryKey`). `contactId` is `supp_<accountCode>`, the id `listContacts`
 * gives the supplier with that code. Money and status are left out for the
 * reasons given in `./invoice`; the raw row stays in `metadata`.
 */
import type { Bill } from '../../../schema/bill'
import { toCalendarDate } from '../../shared/transform'

/** The documented `PurchaseTransactionEnquiryHeader` fields this adapter selects. */
export interface AFPurchaseHeader {
  auditNo?: number | null
  headerRef?: string | null
  accountCode?: string | null
  accountName?: string | null
  transactionType?: string | null
  description?: string | null
  date?: string | null
  dueDate?: string | null
  batched?: boolean | null
  net?: number | null
  tax?: number | null
  gross?: number | null
  outstanding?: number | null
  currencySymbol?: string | null
  currencyNet?: number | null
  currencyTax?: number | null
  currencyGross?: number | null
  currencyOutstanding?: number | null
}

/** The supplier id `listContacts` gives the supplier with this account code. */
export function supplierContactId(accountCode: string | null | undefined): string | undefined {
  return accountCode ? `supp_${accountCode}` : undefined
}

export function transformBill(raw: AFPurchaseHeader): Bill {
  return {
    id: raw.auditNo != null ? String(raw.auditNo) : undefined,
    billNumber: raw.headerRef || undefined,
    contactId: supplierContactId(raw.accountCode),
    notes: raw.description || undefined,
    postedAt: toCalendarDate(raw.date),
    dueAt: toCalendarDate(raw.dueDate),
    metadata: { ...raw },
  }
}
