import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface Fatture24RigaRegistrazione {
  Conto: string
  Descrizione: string
  Dare: number
  Avere: number
  [key: string]: unknown
}

export interface Fatture24Registrazione {
  id: string
  Numero: string
  Descrizione: string
  Data: string
  Righe?: Fatture24RigaRegistrazione[]
  [key: string]: unknown
}

function mapLineitem(row: Fatture24RigaRegistrazione): JournalLineitem {
  return {
    accountId: row.Conto || undefined,
    description: row.Descrizione || undefined,
    debitAmount: row.Dare || undefined,
    creditAmount: row.Avere || undefined,
  }
}

export function transformJournal(raw: Fatture24Registrazione): Journal {
  return {
    id: String(raw.id),
    description: raw.Descrizione || undefined,
    reference: raw.Numero || undefined,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
