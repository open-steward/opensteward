/**
 * Digits ledger `EntryDetail` → canonical Transaction, one per entry.
 *
 * GET /v1/ledger/entries returns `LedgerEntriesResponse` = `{ entryDetails: EntryDetail[], next: Page }`
 * (https://developer.digits.com/openapi/openapi.yaml):
 *   entryDetails: "An entry is a single line item within a transaction;
 *     EntryDetail wraps with transaction info."
 *   EntryDetail: transactionId ("ledger transaction id"), transactionType,
 *     date ("The date which the transaction occurred at"), entry, createdAt
 *     ("When the transaction first appeared in Digits"), updatedAt ("The
 *     latest time any relevant data changed"), bill, invoice.
 *   Entry: id ("The digits transaction entry id"), amount (Currency), type
 *     (Unknown | Credit | Debit), description, category (Category),
 *     counterparty (Party), department, location.
 *   Currency: amount ("Amount is expressed in minor units - $5.00 is 500¢."),
 *     code ("the ISO 4217 currency code"); both required.
 *
 * The canonical id is the ENTRY id: the list serves one row per entry, and a
 * ledger transaction's entries share its `transactionId`, which stays in
 * `metadata`.
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { DigitsCategory } from './account'
import type { DigitsParty } from './contact'

export interface DigitsCurrency {
  amount?: number
  code?: string
}

export interface DigitsEntry {
  id?: string
  amount?: DigitsCurrency
  type?: 'Unknown' | 'Credit' | 'Debit' | string
  description?: string
  category?: DigitsCategory
  counterparty?: DigitsParty
  [key: string]: unknown
}

export interface DigitsEntryDetail {
  transactionId?: string
  transactionType?: string
  date?: string
  entry?: DigitsEntry
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function transformEntryDetail(raw: DigitsEntryDetail): Transaction {
  const entry = raw.entry
  const id = entry?.id
  if (!id) throw new Error('Digits entry detail has no entry.id')

  const contacts: TransactionContact[] = []
  const partyId = entry.counterparty?.id?.id
  if (partyId) contacts.push({ id: partyId, name: entry.counterparty?.name || undefined })

  // Currency requires both fields; without both the amount is not stated.
  const money =
    typeof entry.amount?.amount === 'number' && entry.amount.code
      ? { amount: entry.amount.amount, code: entry.amount.code }
      : undefined

  return {
    id,
    accountId: entry.category?.id || undefined,
    type: raw.transactionType || undefined,
    memo: entry.description || undefined,
    ...(money ? { currency: money.code, totalAmount: money.amount } : {}),
    contacts: contacts.length > 0 ? contacts : undefined,
    postedAt: toDate(raw.date),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    metadata: { ...raw },
  }
}
