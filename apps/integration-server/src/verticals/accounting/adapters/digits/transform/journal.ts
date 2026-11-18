/**
 * Digits ledger `Transaction` → canonical Journal.
 *
 * GET /v1/ledger/transaction/{id} returns `GetLedgerTransactionResponse` =
 * `{ transaction: Transaction }`: "The full transaction for this ID, with all
 * lines" (https://developer.digits.com/openapi/openapi.yaml). `Transaction`:
 *   transactionId ("The digits ledger transaction id"), transactionType,
 *   memo, referenceNumber, amount (Currency), date ("The date the
 *   transaction was occurred at"), sources, entries ("Individual entries /
 *   lines that comprise the transaction."), bill, invoice.
 * Each entry's `type` is "Credit or Debit" and its `amount` is a Currency in
 * minor units ("$5.00 is 500¢"), so a line lands on the side its type names
 * without scaling.
 */
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import type { DigitsCurrency, DigitsEntry } from './transaction'

export interface DigitsLedgerTransaction {
  transactionId?: string
  transactionType?: string
  memo?: string
  referenceNumber?: string
  amount?: DigitsCurrency
  date?: string
  entries?: DigitsEntry[]
  [key: string]: unknown
}

function mapLine(entry: DigitsEntry): JournalLineitem {
  const amount = typeof entry.amount?.amount === 'number' ? entry.amount.amount : undefined
  return {
    id: entry.id || undefined,
    accountId: entry.category?.id || undefined,
    contactId: entry.counterparty?.id?.id || undefined,
    description: entry.description || undefined,
    debitAmount: entry.type === 'Debit' ? amount : undefined,
    creditAmount: entry.type === 'Credit' ? amount : undefined,
  }
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function transformLedgerTransaction(raw: DigitsLedgerTransaction): Journal {
  if (!raw.transactionId) throw new Error('Digits ledger transaction has no transactionId')
  const lines = (raw.entries ?? []).map(mapLine)
  return {
    id: raw.transactionId,
    description: raw.memo || undefined,
    reference: raw.referenceNumber || undefined,
    source: raw.transactionType || undefined,
    currency: raw.amount?.code || undefined,
    lineItems: lines.length > 0 ? lines : undefined,
    postedAt: toDate(raw.date),
    metadata: { ...raw },
  }
}
