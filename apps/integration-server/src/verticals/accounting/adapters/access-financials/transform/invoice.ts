/**
 * Access Financials sales transaction header → canonical Invoice.
 *
 * Read from `debtors.transactions.allTransactions.header`, the sales
 * transaction enquiry. The "Query Transaction Headers" section of
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/sales-transactions
 * lists the fields read here: "accountCode accountName transactionDate
 * periodNumber orderNumber transactionType headerRef batched net tax
 * enteredBy transactionDescription gross outstanding reconciled auditNo
 * yearLabel dueDate ... currencySymbol ...". The live schema types them on
 * `SalesTransactionEnquiryHeader`: `auditNo: Int!`, `transactionDate` and
 * `dueDate: DateOnly` ("Format is `yyyy-MM-dd`"), `transactionType:
 * SalesTransactionType` (NotSet Invoice CreditNote Receipt CreditAdjustment
 * DebitAdjustment).
 *
 * The id is `auditNo`: the enquiry header has no `primaryKey` field, and
 * `auditNo` is its one non-null integer key. `getInvoice` reads the same
 * header back with the documented `auditNo` filter.
 *
 * `contactId` is `cust_<accountCode>`, the id `listContacts` gives the
 * customer with that code.
 *
 * Money is left out on purpose. `net`/`tax`/`gross`/`outstanding` carry no
 * currency, and `currencySymbol` belongs to the `currency*` values. The
 * sales-transactions page shows those as 0 on a home-currency row
 * ("currencyGross": 0) but no `currencySymbol`; the selling-transactions and
 * purchasing-transactions order examples show both side by side
 * ("currencyGross": 0, "currencySymbol": "GBP"). No documented field says which currency the
 * home values are in, so the vertical rule applies: omit money whose
 * currency is undocumented. The raw row stays in `metadata`.
 *
 * Status is left out too: the enquiry reports no document status, and
 * deriving one from `outstanding` would need the money this leaves out.
 */
import type { Invoice } from '../../../schema/invoice'
import { toCalendarDate } from '../../shared/transform'

/** The documented `SalesTransactionEnquiryHeader` fields this adapter selects. */
export interface AFSalesHeader {
  auditNo: number
  headerRef?: string | null
  accountCode?: string | null
  accountName?: string | null
  customerRef?: string | null
  transactionType?: string | null
  transactionDescription?: string | null
  transactionDate?: string | null
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

/** The customer id `listContacts` gives the customer with this account code. */
export function customerContactId(accountCode: string | null | undefined): string | undefined {
  return accountCode ? `cust_${accountCode}` : undefined
}

export function transformInvoice(raw: AFSalesHeader): Invoice {
  return {
    id: String(raw.auditNo),
    type: 'INVOICE',
    invoiceNumber: raw.headerRef || undefined,
    contactId: customerContactId(raw.accountCode),
    reference: raw.customerRef || undefined,
    postedAt: toCalendarDate(raw.transactionDate),
    dueAt: toCalendarDate(raw.dueDate),
    metadata: { ...raw },
  }
}
