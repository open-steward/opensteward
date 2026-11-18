/**
 * Access Financials sales credit note → canonical CreditMemo.
 *
 * A credit note is a row of the sales transaction enquiry
 * (`debtors.transactions.allTransactions.header`) whose `transactionType`
 * is `CreditNote`, a value of the live schema's `SalesTransactionType`
 * enum. The sales-transactions page names the bulk-create types "Sales
 * Invoice / Sales Credit Note / Sales Receipt / ...". Field provenance, the
 * `auditNo` id and the reasons money and status are left out are in
 * `./invoice`.
 */
import type { CreditMemo } from '../../../schema/creditmemo'
import { toCalendarDate } from '../../shared/transform'
import { customerContactId, type AFSalesHeader } from './invoice'

export function transformCreditMemo(raw: AFSalesHeader): CreditMemo {
  return {
    id: String(raw.auditNo),
    creditmemoNumber: raw.headerRef || undefined,
    contactId: customerContactId(raw.accountCode),
    postedAt: toCalendarDate(raw.transactionDate),
    dueAt: toCalendarDate(raw.dueDate),
    metadata: { ...raw },
  }
}
