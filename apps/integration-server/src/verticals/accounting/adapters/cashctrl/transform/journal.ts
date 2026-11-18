/**
 * CashCtrl journal entry → canonical Journal transform.
 *
 * CashCtrl supports two types of journal entries:
 *   • Simple entry: debitId / creditId + amount (single debit and credit).
 *   • Collective entry: items[] array with individual accountId, debit/credit amounts.
 *
 * Both are listed via GET /journal/list.json and read via GET /journal/read.json.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#journal
 */
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface CashCtrlJournalItem {
  id?: number | null
  accountId?: number | null
  description?: string | null
  debit?: number | null
  credit?: number | null
  taxId?: number | null
  taxAmount?: number | null
  [key: string]: unknown
}

/**
 * CashCtrl journal entry record as returned by GET /journal/read.json
 * and listed via GET /journal/list.json.
 */
export interface CashCtrlJournal {
  id: number
  /** Transaction / value date (ISO date string "YYYY-MM-DD"). */
  dateAdded?: string | null
  /** Entry title / description. */
  title?: string | null
  /** Reference string (e.g. receipt number). */
  reference?: string | null
  /** ISO 4217 currency code. */
  currencyCode?: string | null
  /** For simple entries: the account to debit. */
  debitId?: number | null
  /** For simple entries: the account to credit. */
  creditId?: number | null
  /** For simple entries: the transaction amount. */
  amount?: number | null
  /** For collective entries: the array of individual lines. */
  items?: CashCtrlJournalItem[] | null
  [key: string]: unknown
}

function buildLineitems(raw: CashCtrlJournal): JournalLineitem[] {
  // Collective entry
  if (raw.items?.length) {
    return raw.items.map((item): JournalLineitem => ({
      id: item.id != null ? String(item.id) : undefined,
      accountId: item.accountId != null ? String(item.accountId) : undefined,
      description: item.description || undefined,
      debitAmount: item.debit ?? undefined,
      creditAmount: item.credit ?? undefined,
      taxAmount: item.taxAmount ?? undefined,
    }))
  }

  // Simple entry: build two synthetic lineItems (debit line + credit line)
  const lines: JournalLineitem[] = []
  if (raw.debitId != null) {
    lines.push({
      accountId: String(raw.debitId),
      description: raw.title || undefined,
      debitAmount: raw.amount ?? undefined,
    })
  }
  if (raw.creditId != null) {
    lines.push({
      accountId: String(raw.creditId),
      description: raw.title || undefined,
      creditAmount: raw.amount ?? undefined,
    })
  }
  return lines
}

export function transformJournal(raw: CashCtrlJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.title || undefined,
    reference: raw.reference || undefined,
    currency: raw.currencyCode || undefined,
    lineItems: buildLineitems(raw),
    postedAt: raw.dateAdded ? new Date(raw.dateAdded) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
