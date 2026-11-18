import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BmanRigaRegistrazione {
  conto: string
  descrizione: string
  dare: number
  avere: number
  [key: string]: unknown
}

export interface BmanRegistrazione {
  id: string
  numero: string
  descrizione: string
  data: string
  righe?: BmanRigaRegistrazione[]
  [key: string]: unknown
}

function mapLineitem(row: BmanRigaRegistrazione): JournalLineitem {
  return {
    accountId: row.conto || undefined,
    description: row.descrizione || undefined,
    debitAmount: row.dare || undefined,
    creditAmount: row.avere || undefined,
  }
}

export function transformJournal(raw: BmanRegistrazione): Journal {
  return {
    id: String(raw.id),
    description: raw.descrizione || undefined,
    reference: raw.numero || undefined,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
