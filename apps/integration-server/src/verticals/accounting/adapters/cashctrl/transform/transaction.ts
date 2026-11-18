/**
 * CashCtrl journal entry → canonical Transaction transform.
 *
 * CashCtrl has no dedicated "transaction" resource. The closest concept is a
 * journal entry (`/journal/list.json`, `/journal/read.json`). Journal entries
 * represent posted accounting transactions with debit/credit account pairs and
 * optional line items for collective entries.
 *
 * We re-use the CashCtrlJournal shape from journal.ts and map it to the
 * canonical Transaction schema. For simple (non-collective) entries, a single
 * TransactionLineitem pair is synthesised from the top-level debitId/creditId
 * fields. For collective entries, each item in the `items` array becomes a
 * TransactionLineitem using the accountId and the larger of debit/credit.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#journal
 */
import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import type { CashCtrlJournal, CashCtrlJournalItem } from './journal'

function mapJournalItemToLineitem(item: CashCtrlJournalItem): TransactionLineitem {
  // Use whichever side (debit/credit) is non-zero as the line total.
  const totalAmount = (item.debit ?? 0) !== 0 ? (item.debit ?? undefined) : (item.credit ?? undefined)
  return {
    id: item.id != null ? String(item.id) : undefined,
    accountId: item.accountId != null ? String(item.accountId) : undefined,
    description: item.description || undefined,
    totalAmount,
  }
}

export function transformTransaction(raw: CashCtrlJournal): Transaction {
  let lineItems: TransactionLineitem[] | undefined

  if (raw.items?.length) {
    // Collective entry: map each item
    lineItems = raw.items.map(mapJournalItemToLineitem)
  } else if (raw.debitId != null || raw.creditId != null) {
    // Simple entry: synthesise two lineItems (debit + credit)
    lineItems = []
    if (raw.debitId != null) {
      lineItems.push({
        accountId: String(raw.debitId),
        description: raw.title || undefined,
        totalAmount: raw.amount ?? undefined,
      })
    }
    if (raw.creditId != null) {
      lineItems.push({
        accountId: String(raw.creditId),
        description: raw.title || undefined,
        totalAmount: raw.amount ?? undefined,
      })
    }
  }

  return {
    id: String(raw.id),
    accountId: raw.debitId != null ? String(raw.debitId) : undefined,
    splitAccountId: raw.creditId != null ? String(raw.creditId) : undefined,
    reference: raw.reference || undefined,
    memo: raw.title || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amount ?? undefined,
    lineItems: lineItems && lineItems.length > 0 ? lineItems : undefined,
    createdAt: raw.dateAdded ? new Date(raw.dateAdded) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
