import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FreeAgentJournalEntry {
  url: string
  dated_on: string
  description: string
  debit_account: string
  credit_account: string
  debit_value: string
  credit_value: string
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

export function transformJournal(raw: FreeAgentJournalEntry): Journal {
  const lineItems: JournalLineitem[] = [
    {
      accountId: raw.debit_account ? extractId(raw.debit_account) : undefined,
      description: raw.description || undefined,
      debitAmount: parseFloat(raw.debit_value) || undefined,
    },
    {
      accountId: raw.credit_account ? extractId(raw.credit_account) : undefined,
      description: raw.description || undefined,
      creditAmount: parseFloat(raw.credit_value) || undefined,
    },
  ]

  return {
    id: extractId(raw.url),
    description: raw.description || undefined,
    lineItems,
    postedAt: raw.dated_on ? new Date(raw.dated_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
