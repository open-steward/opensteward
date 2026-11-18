import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

// ── Tyms wire types ────────────────────────────────────────────────────────────

export interface TymsJournalItem {
  uuid?: string
  account?: string | { uuid?: string; [key: string]: unknown }
  description?: string
  debit?: number
  credit?: number
  amount?: number
  contact?: { uuid?: string; [key: string]: unknown }
  project?: string
  department?: string
  branch?: string
  [key: string]: unknown
}

export interface TymsJournal {
  uuid: string
  journal_no?: string
  description?: string
  date?: string
  currency?: string
  exchange_rate?: number
  customer_uuid?: string
  customer_name?: string
  journal_group?: string
  items?: TymsJournalItem[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Line-item mapping ──────────────────────────────────────────────────────────

function extractAccountId(account: TymsJournalItem['account']): string | undefined {
  if (!account) return undefined
  if (typeof account === 'string') return account || undefined
  return account.uuid || undefined
}

function mapJournalItem(item: TymsJournalItem): JournalLineitem {
  return {
    id: item.uuid || undefined,
    accountId: extractAccountId(item.account),
    contactId: item.contact?.uuid || undefined,
    description: item.description || undefined,
    debitAmount: item.debit ?? undefined,
    creditAmount: item.credit ?? undefined,
    totalAmount: item.amount ?? undefined,
    projectId: item.project || undefined,
  }
}

// ── Public transform ───────────────────────────────────────────────────────────

export function transformJournal(raw: TymsJournal): Journal {
  return {
    id: raw.uuid,
    description: raw.description || undefined,
    reference: raw.journal_no || undefined,
    currency: raw.currency || undefined,
    lineItems: Array.isArray(raw.items) ? raw.items.map(mapJournalItem) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Canonical → Tyms body (create) ────────────────────────────────────────────

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    date: toCalendarDate(journal.postedAt),
    description: journal.description,
    journal_no: journal.reference,
    currency: journal.currency,
    exchange_rate: 1,
    items: journal.lineItems?.map((li) => ({
      account: li.accountId,
      description: li.description,
      debit: li.debitAmount,
      credit: li.creditAmount,
    })),
  }
}
