import { toCalendarDate } from '../../shared/transform'
/**
 * MRI Software — Journal Entry transform.
 *
 * MRI General Ledger journal entries expose debit/credit line items.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MriJournalLine {
  id?: string
  accountId?: string
  contactId?: string
  description?: string
  debitAmount?: number
  creditAmount?: number
  taxAmount?: number
  totalAmount?: number
  [key: string]: unknown
}

export interface MriJournalEntry {
  id: string
  description?: string
  reference?: string
  source?: string
  currencyCode?: string
  taxAmount?: number
  postedDate?: string
  lines?: MriJournalLine[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapJournalLine(line: MriJournalLine): JournalLineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountId || undefined,
    contactId: line.contactId || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount ?? undefined,
    creditAmount: line.creditAmount ?? undefined,
    taxAmount: line.taxAmount ?? undefined,
    totalAmount: line.totalAmount ?? undefined,
  }
}

export function transformJournal(raw: MriJournalEntry): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    source: raw.source || undefined,
    currency: raw.currencyCode || undefined,
    taxAmount: raw.taxAmount ?? undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.postedDate ? new Date(raw.postedDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(data: Partial<Journal>): Record<string, unknown> {
  return {
    description: data.description,
    reference: data.reference,
    currencyCode: data.currency,
    postedDate: toCalendarDate(data.postedAt),
    lines: data.lineItems?.map((li) => ({
      accountId: li.accountId,
      description: li.description,
      debitAmount: li.debitAmount,
      creditAmount: li.creditAmount,
    })),
  }
}
