/**
 * Bind ERP → canonical Journal transform.
 *
 * Source: GET /api/AccountingJournals
 *
 * Bind ERP AccountingJournal fields (SDK v1.2):
 *   ID, DocumentID, Type, ApplicationDate, CreationDate,
 *   Number, LocationID, PeriodType, Items[]
 *
 * Each item: AccountID, AccountName, Description, Debit, Charge
 * ("Charge" = credit in standard double-entry terminology)
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

// ── Raw Bind ERP types ──────────────────────────────────────────────────────

export interface BindAccountingJournalItem {
  AccountID?: string
  AccountName?: string
  Description?: string
  Debit?: number
  Charge?: number
  [key: string]: unknown
}

export interface BindAccountingJournal {
  ID?: string
  DocumentID?: string
  Type?: string
  ApplicationDate?: string
  CreationDate?: string
  Number?: number
  LocationID?: string
  PeriodType?: string
  Items?: BindAccountingJournalItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function transformJournalItem(item: BindAccountingJournalItem): JournalLineitem {
  return {
    accountId: item.AccountID || undefined,
    description: item.Description || item.AccountName || undefined,
    debitAmount: item.Debit || undefined,
    creditAmount: item.Charge || undefined,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformJournal(raw: BindAccountingJournal): Journal {
  return {
    id: raw.ID || (raw.Number ? String(raw.Number) : ''),
    description: raw.Type || raw.PeriodType || undefined,
    reference: raw.DocumentID || undefined,
    lineItems: (raw.Items ?? []).map(transformJournalItem),
    postedAt: raw.ApplicationDate ? new Date(raw.ApplicationDate) : undefined,
    createdAt: raw.CreationDate ? new Date(raw.CreationDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
