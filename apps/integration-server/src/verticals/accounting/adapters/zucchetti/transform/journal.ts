import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ZucchettiRigaRegistrazione {
  conto: string
  descrizione: string
  dare: number
  avere: number
  [key: string]: unknown
}

export interface ZucchettiRegistrazione {
  id: string
  numero: string
  descrizione: string
  data: string
  righe?: ZucchettiRigaRegistrazione[]
  [key: string]: unknown
}

function mapLineitem(row: ZucchettiRigaRegistrazione): JournalLineitem {
  return {
    accountId: row.conto || undefined,
    description: row.descrizione || undefined,
    debitAmount: row.dare || undefined,
    creditAmount: row.avere || undefined,
  }
}

export function transformJournal(raw: ZucchettiRegistrazione): Journal {
  return {
    id: String(raw.id),
    description: raw.descrizione || undefined,
    reference: raw.numero || undefined,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
