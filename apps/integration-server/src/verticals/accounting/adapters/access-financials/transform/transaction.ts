/**
 * Access Financials sales ledger transaction → canonical Transaction.
 *
 * Every row of the sales transaction enquiry
 * (`debtors.transactions.allTransactions.header`), whatever its
 * `transactionType` (Invoice, CreditNote, Receipt, CreditAdjustment,
 * DebitAdjustment). `type` is that documented enum value as sent. Field
 * provenance, the `auditNo` id and the reason money is left out are in
 * `./invoice`.
 */
import type { Transaction } from '../../../schema/transaction'
import { toCalendarDate } from '../../shared/transform'
import { customerContactId, type AFSalesHeader } from './invoice'

export function transformTransaction(raw: AFSalesHeader): Transaction {
  const contactId = customerContactId(raw.accountCode)
  return {
    id: String(raw.auditNo),
    type: raw.transactionType || undefined,
    reference: raw.headerRef || undefined,
    memo: raw.transactionDescription || undefined,
    contacts: contactId ? [{ id: contactId, name: raw.accountName || undefined }] : undefined,
    postedAt: toCalendarDate(raw.transactionDate),
    metadata: { ...raw },
  }
}
