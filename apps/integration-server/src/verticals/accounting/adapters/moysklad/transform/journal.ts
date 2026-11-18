import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MoyskladJournalLine {
  id?: string
  account?: { meta?: { href?: string } }
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface MoyskladJournal {
  id?: string
  moment?: string
  description?: string
  name?: string
  currency?: { name?: string }
  rows?: MoyskladJournalLine[]
  [key: string]: unknown
}

function getLastSegment(href?: string): string | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  return parts[parts.length - 1] || undefined
}

export function transformJournal(raw: MoyskladJournal): Journal {
  return {
    id: raw.id ? String(raw.id) : '',
    description: raw.description || undefined,
    reference: raw.name || undefined,
    currency: raw.currency?.name || undefined,
    postedAt: raw.moment ? new Date(raw.moment) : undefined,
    lineItems: (raw.rows ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      accountId: getLastSegment(l.account?.meta?.href),
      description: l.description || undefined,
      debitAmount: l.debit,
      creditAmount: l.credit,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
