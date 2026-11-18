/**
 * AFAS Profit_Transactions GetConnector → canonical Transaction transform.
 *
 * Fields returned by Profit_Transactions:
 *   TransactionNr   — unique transaction / mutation number
 *   AccountNr       — general ledger account number
 *   RelationId      — debtor or creditor relation code
 *   RelationName    — relation display name
 *   Description     — transaction description
 *   Amount          — transaction amount (signed: debit positive, credit negative)
 *   CurrencyId      — currency code
 *   TransDate       — booking date
 *   DocumentNr      — related document (invoice) number
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'
import { toMinorUnits } from '../../shared/transform'

export interface AfasTransaction {
  TransactionNr: string
  AccountNr: string
  RelationId: string
  RelationName: string
  Description: string
  Amount: number
  CurrencyId: string
  TransDate: string
  DocumentNr: string
  [key: string]: unknown
}

export function transformTransaction(raw: AfasTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.RelationId) {
    contacts.push({ id: raw.RelationId, name: raw.RelationName || undefined })
  }

  return {
    id: raw.TransactionNr,
    accountId: raw.AccountNr || undefined,
    reference: raw.DocumentNr || undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: toMinorUnits(raw.Amount),
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: typeof raw.TransDate === 'string' && raw.TransDate ? new Date(raw.TransDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
